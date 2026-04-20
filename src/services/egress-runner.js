'use strict';

// Egress Runner — v6.7.0-alpha.3
//
// Orchestrates the helper-container installation of nftables rules inside a
// target container's netns, redirecting all TCP egress to the dd-egress-proxy
// sidecar (except DNS and the sidecar itself).
//
// Design: see docs/planning/v6.7/outbound-filter/02-deep-spec.md §4.
// Validated sequence in preflight P1 (2026-04-20).
//
// Invariants:
//   - Uses a short-lived helper container with NET_ADMIN (not the Docker Dash
//     container itself — keeps main app CIS-compliant).
//   - All nftables objects live in `ip ddout` table so they're identifiable.
//   - apply + apply is idempotent (rules live in the table; re-applying just
//     replaces them).
//   - remove-when-not-applied is safe (flush on an empty table is a no-op).
//   - All apply/remove ops complete in < 10 seconds.

const log = require('../utils/logger')('egress-runner');
const dockerService = require('./docker');

// The helper image runs the install/uninstall script. Uses Alpine + nftables
// package. Could switch to a pre-baked image later for faster cold-start.
const HELPER_IMAGE = process.env.DD_EGRESS_HELPER_IMAGE || 'alpine:3.19';

// Where the sidecar listens. Operator configures via env — runner does NOT
// auto-discover (keeps the blast radius predictable).
function _sidecarEndpoint() {
  const v = process.env.DD_EGRESS_SIDECAR_ENDPOINT;
  if (!v) {
    throw new Error('DD_EGRESS_SIDECAR_ENDPOINT not set — e.g. "172.17.0.5:29193". Configure before applying.');
  }
  const [ip, port] = v.split(':');
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip) || !/^\d+$/.test(port)) {
    throw new Error(`DD_EGRESS_SIDECAR_ENDPOINT must be "ip:port", got "${v}"`);
  }
  return { ip, port: parseInt(port, 10) };
}

// ─── Apply / Remove scripts ─────────────────────────

// Installed by a helper container entered into the target's network namespace
// via `--network container:<target-id>`. Rules persist in the netns after
// helper exits (preflight P1 confirmed).
//
// Logic:
//   - Any TCP output to sidecar IP:port → accept unchanged
//   - Port 53 UDP/TCP (DNS) → accept
//   - Loopback (lo interface) → accept
//   - Destinations on the container's local bridge (RFC1918 same-subnet)
//     need to pass for service-to-service traffic — we let RFC1918 pass for
//     now. Users wanting stricter per-stack policies come to v6.7-rc2.
//   - Everything else → DNAT to sidecar, hitting the SNI/Host-peek logic
function _applyScript(sidecarIp, sidecarPort) {
  return [
    'apk add -q --no-cache nftables',
    // Idempotent: delete any previous table, then recreate
    'nft delete table ip ddout 2>/dev/null || true',
    'nft add table ip ddout',
    'nft add chain ip ddout prerouting "{ type nat hook output priority -100 ; }"',
    // Accept traffic to the sidecar itself (no loop)
    `nft add rule ip ddout prerouting ip daddr ${sidecarIp} tcp dport ${sidecarPort} return`,
    // Accept DNS (UDP/TCP port 53) — container still needs name resolution
    'nft add rule ip ddout prerouting udp dport 53 return',
    'nft add rule ip ddout prerouting tcp dport 53 return',
    // Accept loopback + RFC1918 to preserve service-to-service (will be
    // tightened per-stack in rc2)
    'nft add rule ip ddout prerouting oifname "lo" return',
    'nft add rule ip ddout prerouting ip daddr 127.0.0.0/8 return',
    'nft add rule ip ddout prerouting ip daddr 10.0.0.0/8 return',
    'nft add rule ip ddout prerouting ip daddr 172.16.0.0/12 return',
    'nft add rule ip ddout prerouting ip daddr 192.168.0.0/16 return',
    // Everything else — redirect to the sidecar
    `nft add rule ip ddout prerouting tcp dport 0-65535 dnat to ${sidecarIp}:${sidecarPort}`,
    // Print final state for audit trail
    'nft list table ip ddout',
  ].join(' && ');
}

function _removeScript() {
  return [
    'apk add -q --no-cache nftables',
    'nft delete table ip ddout 2>/dev/null || true',
    'echo removed',
  ].join(' && ');
}

function _inspectScript() {
  return [
    'apk add -q --no-cache nftables',
    '(nft list table ip ddout 2>/dev/null && echo APPLIED) || echo NOT_APPLIED',
  ].join(' && ');
}

// ─── Helper runner ───────────────────────────────────

async function _runHelper(containerId, hostId, script) {
  const docker = dockerService.getDocker(hostId || 0);
  const helper = await docker.createContainer({
    Image: HELPER_IMAGE,
    Cmd: ['sh', '-c', script],
    HostConfig: {
      NetworkMode: `container:${containerId}`,
      CapAdd: ['NET_ADMIN'],
      AutoRemove: false,  // we manage removal for stdout capture
    },
    Tty: false,
    AttachStdout: true,
    AttachStderr: true,
  });

  try {
    await helper.start();
    const logsStream = await helper.logs({ stdout: true, stderr: true, follow: true });
    let out = '';
    await new Promise((resolve) => {
      logsStream.on('data', (chunk) => { out += chunk.toString('utf8', 8); });  // strip docker log framing header (8B)
      logsStream.on('end', resolve);
      logsStream.on('error', resolve);
    });
    const result = await helper.wait();
    return { exitCode: result.StatusCode, output: out };
  } finally {
    try { await helper.remove({ force: true }); } catch { /* helper already gone */ }
  }
}

// ─── Public API ──────────────────────────────────────

/**
 * Install the egress filter into a running container's netns.
 * Idempotent: re-applying replaces the ruleset cleanly.
 */
async function applyToContainer({ containerId, hostId = 0 }) {
  if (!containerId) throw new Error('containerId required');

  const { ip, port } = _sidecarEndpoint();
  const script = _applyScript(ip, port);

  log.info('Applying egress filter', { containerId, hostId, sidecar: `${ip}:${port}` });
  const { exitCode, output } = await _runHelper(containerId, hostId, script);
  if (exitCode !== 0) {
    throw new Error(`Helper exited ${exitCode}: ${output}`);
  }
  log.info('Egress filter applied', { containerId, hostId });
  return { ok: true, output: output.trim() };
}

/**
 * Remove the egress filter from a container. Safe to call when nothing is
 * installed (runs `nft delete table ip ddout || true`).
 */
async function removeFromContainer({ containerId, hostId = 0 }) {
  if (!containerId) throw new Error('containerId required');

  const script = _removeScript();
  log.info('Removing egress filter', { containerId, hostId });
  const { exitCode, output } = await _runHelper(containerId, hostId, script);
  if (exitCode !== 0) {
    throw new Error(`Helper exited ${exitCode}: ${output}`);
  }
  return { ok: true, output: output.trim() };
}

/**
 * Check whether our filter table is currently installed in a container's netns.
 */
async function isApplied({ containerId, hostId = 0 }) {
  if (!containerId) throw new Error('containerId required');

  const script = _inspectScript();
  const { exitCode, output } = await _runHelper(containerId, hostId, script);
  if (exitCode !== 0) {
    throw new Error(`Helper exited ${exitCode}: ${output}`);
  }
  // Check for NOT_APPLIED first — "APPLIED" is a substring of it.
  const applied = !/NOT_APPLIED/.test(output) && /\bAPPLIED\b/.test(output);
  return { applied, details: output.trim() };
}

module.exports = {
  applyToContainer,
  removeFromContainer,
  isApplied,
  _internals: { _applyScript, _removeScript, _inspectScript, _sidecarEndpoint, HELPER_IMAGE },
};
