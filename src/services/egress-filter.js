'use strict';

// Outbound Network Filter — v6.7 (alpha.1: config layer only)
//
// This ships the data model + CRUD + precondition checks. The actual
// enforcement (sidecar + nftables + SNI peek) lands in rc2.
//
// See docs/planning/v6.7/outbound-filter/02-deep-spec.md §§1-4.
//
// Design notes graduated from preflight spikes:
// - `canApplyFilter()` classification → P10 (9/9 unit tests PASS).
// - Data model → matches §2 of the deep-spec verbatim.
//
// Policies in this alpha are persisted but have no runtime effect. The UI
// must label them as "config only" until the sidecar ships. This lets users
// configure + review allowlists ahead of enforcement landing.

const fs = require('fs');
const path = require('path');
const log = require('../utils/logger')('egress-filter');
const { getDb } = require('../db');

// Where the sidecar reads its policy from. Both the app container and the
// sidecar mount the same `docker-dash-egress` volume; this path is inside
// that volume. Read per-call so tests can override via env.
function _policyPath() {
  return process.env.DD_EGRESS_POLICY_PATH || '/data/egress-policy/policy.json';
}

// Emit a signal hint so the runtime knows to SIGHUP the sidecar after writing.
// The actual kill happens in a hook registered by server.js (see rc1 wiring).
let _onPolicyWritten = null;
function setOnPolicyWritten(fn) { _onPolicyWritten = fn; }

// ─── Preset allowlists ──────────────────────────────────
// Each preset is a static list of hostnames (with wildcards). Users can
// start with a preset + override in 'custom' mode for fine-tuning.
const PRESETS = {
  'registry-only': {
    name: 'Registry-only',
    description: 'Docker / npm / pypi / etc. registries only. Blocks everything else including IMDS.',
    allowlist: [
      'docker.io',
      'registry-1.docker.io',
      'auth.docker.io',
      'production.cloudflare.docker.com',
      'ghcr.io',
      'quay.io',
      'gcr.io',
      'registry.k8s.io',
      'registry.npmjs.org',
      'pypi.org',
      'files.pythonhosted.org',
      'rubygems.org',
      'crates.io',
      'static.crates.io',
    ],
  },
  'registries-github': {
    name: 'Registries + GitHub',
    description: 'Above plus GitHub + GHCR for build pipelines that pull from repos.',
    allowlist: [
      // registry-only inherited below at resolve-time
      'github.com',
      '*.github.com',
      'api.github.com',
      'codeload.github.com',
      'objects.githubusercontent.com',
      'raw.githubusercontent.com',
    ],
  },
  'lockdown': {
    name: 'Lockdown',
    description: 'No outbound at all. Loopback + same-stack networks only. Use for containers that should never talk to the internet.',
    allowlist: [],
  },
  'audit-only': {
    name: 'Audit-only',
    description: 'Log denied attempts but don\'t block them. Use for safe migration — apply your real policy once the log is quiet.',
    allowlist: [],  // The wizard switches mode to 'audit-only' for this preset
  },
  'custom': {
    name: 'Custom',
    description: 'Hand-edit the hostname list.',
    allowlist: [],
  },
};

// IMDS endpoints — always implicitly blocked, regardless of policy.
// Documented as an invariant in deep-spec §13 decision 7.
const IMDS_ENDPOINTS = [
  '169.254.169.254',
  'metadata.google.internal',
  '169.254.170.2',  // ECS task role
];

// ─── Precondition check ────────────────────────────────
// Graduated from the P10 spike at
// docs/planning/v6.7/outbound-filter/spikes/p10-netadmin-check.js.
// A container with NET_ADMIN / SYS_ADMIN / privileged can modify its own
// netns's iptables rules, making the filter pointless. We refuse attach.

const REFUSING_CAPS = new Set(['NET_ADMIN', 'SYS_ADMIN']);

function canApplyFilter(inspect) {
  const hc = inspect.HostConfig || {};

  if (hc.Privileged === true) {
    return {
      ok: false,
      reason: 'Container runs in privileged mode — it can modify its own iptables/nftables rules and bypass the filter. Drop privileged mode first, then re-apply the filter.',
    };
  }

  for (const cap of hc.CapAdd || []) {
    if (REFUSING_CAPS.has(cap)) {
      return {
        ok: false,
        reason: `Container has capability ${cap} — it can modify its own iptables/nftables rules and bypass the filter. Drop this capability (via the Remediation Wizard or compose edit), then re-apply.`,
      };
    }
  }

  const networkMode = hc.NetworkMode || 'default';
  if (networkMode === 'host') {
    return {
      ok: false,
      reason: 'Container uses network_mode: host — it shares the host\'s network namespace, where we cannot install per-container filter rules. Switch to a bridge network, then re-apply.',
    };
  }
  if (networkMode === 'none') {
    return {
      ok: false,
      reason: 'Container uses network_mode: none — it already has no network access, so no filter is needed.',
    };
  }
  if (networkMode.startsWith('container:')) {
    return {
      ok: false,
      reason: `Container shares its network namespace with ${networkMode} — apply the filter to that container instead.`,
    };
  }

  return { ok: true };
}

// ─── Allowlist resolution ───────────────────────────────

function resolvePreset(preset, customAllowlist) {
  if (preset === 'custom') {
    return dedupe(customAllowlist || []);
  }
  if (preset === 'audit-only') {
    // Audit-only mode still has a "what would we block" list. Default to registry-only
    // unless the user supplied their own.
    return dedupe((customAllowlist && customAllowlist.length) ? customAllowlist : PRESETS['registry-only'].allowlist);
  }
  if (preset === 'registries-github') {
    return dedupe([...PRESETS['registry-only'].allowlist, ...PRESETS['registries-github'].allowlist]);
  }
  const p = PRESETS[preset];
  if (!p) throw new Error(`Unknown preset: ${preset}`);
  return dedupe(p.allowlist);
}

function dedupe(arr) {
  return Array.from(new Set(arr.map((s) => String(s).trim().toLowerCase()).filter(Boolean)));
}

function validateAllowlistEntry(entry) {
  // Allow: hostname (with optional leading wildcard subdomain), IPs are explicitly rejected —
  // users should rely on DNS-resolved hostnames. IMDS endpoints also rejected (always implicitly blocked).
  if (!entry || typeof entry !== 'string') return 'Empty entry';
  const e = entry.trim().toLowerCase();
  if (/^\d+\.\d+\.\d+\.\d+(\/\d+)?$/.test(e)) return 'IP addresses not allowed — use hostnames';
  if (IMDS_ENDPOINTS.includes(e)) return `${e} is always blocked regardless of policy — remove from allowlist`;
  if (!/^\*?(\.?[a-z0-9][a-z0-9-]*)(\.[a-z0-9][a-z0-9-]*)+\.?$/i.test(e)) return `Invalid hostname: ${e}`;
  return null;  // OK
}

// ─── Policy CRUD ────────────────────────────────────────

function listPresets() {
  return Object.entries(PRESETS).map(([id, { name, description, allowlist }]) => ({
    id,
    name,
    description,
    resolvedAllowlist: (id === 'registries-github')
      ? dedupe([...PRESETS['registry-only'].allowlist, ...allowlist])
      : dedupe(allowlist),
  }));
}

function listPolicies({ hostId } = {}) {
  const db = getDb();
  const args = [];
  let sql = 'SELECT * FROM egress_policies WHERE active = 1';
  if (hostId != null) { sql += ' AND host_id = ?'; args.push(hostId); }
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...args);
  return rows.map(_mapRow);
}

function getPolicy(id) {
  const row = getDb().prepare('SELECT * FROM egress_policies WHERE id = ?').get(id);
  return row ? _mapRow(row) : null;
}

function getPolicyForScope({ scopeType, scopeKey, hostId = 0 }) {
  const row = getDb().prepare(
    'SELECT * FROM egress_policies WHERE scope_type = ? AND scope_key = ? AND host_id = ? AND active = 1'
  ).get(scopeType, scopeKey, hostId);
  return row ? _mapRow(row) : null;
}

function createPolicy({ scopeType, scopeKey, hostId = 0, preset, customAllowlist, mode = 'enforce', createdBy }) {
  if (!['container', 'stack'].includes(scopeType)) throw new Error(`Invalid scope_type: ${scopeType}`);
  if (!scopeKey) throw new Error('scopeKey required');
  if (!PRESETS[preset]) throw new Error(`Unknown preset: ${preset}`);
  if (!['enforce', 'audit-only'].includes(mode)) throw new Error(`Invalid mode: ${mode}`);

  const resolved = resolvePreset(preset, customAllowlist);
  for (const entry of resolved) {
    const err = validateAllowlistEntry(entry);
    if (err) throw new Error(`Allowlist validation: ${err}`);
  }

  // Audit-only preset maps to mode='audit-only' regardless of what the caller passed
  const effectiveMode = preset === 'audit-only' ? 'audit-only' : mode;

  const db = getDb();
  // Upsert (replace existing active policy for this scope)
  const existing = getPolicyForScope({ scopeType, scopeKey, hostId });
  if (existing) {
    db.prepare(`
      UPDATE egress_policies
      SET preset = ?, allowlist = ?, mode = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(preset, JSON.stringify(resolved), effectiveMode, existing.id);
    log.info('Egress policy updated', { policyId: existing.id, scopeType, scopeKey, preset, mode: effectiveMode });
    writePolicyFile();
    return { policyId: existing.id, updated: true, allowlist: resolved, mode: effectiveMode };
  }

  const res = db.prepare(`
    INSERT INTO egress_policies (scope_type, scope_key, host_id, preset, allowlist, mode, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(scopeType, scopeKey, hostId, preset, JSON.stringify(resolved), effectiveMode, createdBy || null);

  log.info('Egress policy created', { policyId: res.lastInsertRowid, scopeType, scopeKey, preset, mode: effectiveMode });
  writePolicyFile();
  return { policyId: res.lastInsertRowid, updated: false, allowlist: resolved, mode: effectiveMode };
}

function updatePolicy(id, changes) {
  const existing = getPolicy(id);
  if (!existing) throw new Error(`Policy ${id} not found`);

  const patched = {
    scopeType: existing.scopeType,
    scopeKey: existing.scopeKey,
    hostId: existing.hostId,
    preset: changes.preset != null ? changes.preset : existing.preset,
    customAllowlist: changes.customAllowlist,
    mode: changes.mode != null ? changes.mode : existing.mode,
  };

  if (!PRESETS[patched.preset]) throw new Error(`Unknown preset: ${patched.preset}`);
  const resolved = resolvePreset(patched.preset, patched.customAllowlist || existing.allowlist);
  for (const entry of resolved) {
    const err = validateAllowlistEntry(entry);
    if (err) throw new Error(`Allowlist validation: ${err}`);
  }

  const effectiveMode = patched.preset === 'audit-only' ? 'audit-only' : patched.mode;

  getDb().prepare(`
    UPDATE egress_policies SET preset = ?, allowlist = ?, mode = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(patched.preset, JSON.stringify(resolved), effectiveMode, id);

  log.info('Egress policy updated', { policyId: id, preset: patched.preset, mode: effectiveMode });
  writePolicyFile();
  return getPolicy(id);
}

function removePolicy(id, { reason = 'user-requested' } = {}) {
  const existing = getPolicy(id);
  if (!existing) throw new Error(`Policy ${id} not found`);
  getDb().prepare('UPDATE egress_policies SET active = 0, updated_at = datetime(\'now\') WHERE id = ?').run(id);
  log.info('Egress policy removed (soft-deleted)', { policyId: id, reason });
  writePolicyFile();
  return { removed: true, policyId: id };
}

// ─── Block log ──────────────────────────────────────────

function getBlockLog(policyId, { limit = 100, sinceId = 0 } = {}) {
  const rows = getDb().prepare(`
    SELECT id, container_id, hostname, port, proto, reason, blocked_at
    FROM egress_block_log
    WHERE policy_id = ? AND id > ?
    ORDER BY id DESC
    LIMIT ?
  `).all(policyId, sinceId, Math.min(1000, Math.max(1, limit)));
  return rows;
}

// Called by the sidecar once enforcement lands (rc2). Exposed now as a no-op-safe
// API hook so we can wire the contract early.
function recordBlockedAttempt({ policyId, containerId, hostname, port, proto, reason }) {
  if (!policyId || !hostname || !port || !proto) throw new Error('missing required fields');
  getDb().prepare(`
    INSERT INTO egress_block_log (policy_id, container_id, hostname, port, proto, reason)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(policyId, containerId || '', String(hostname), Number(port), proto, reason || 'not-in-allowlist');
}

// ─── Sidecar policy.json writer (v6.7.0-alpha.2) ───────
//
// Alpha ships a single global policy.json for the sidecar. All active
// policies' allowlists are merged (union). Mode = 'audit-only' only when
// EVERY active policy is audit-only, else 'enforce'. Per-container policy
// routing by source IP lands in rc1.

function _buildAggregatePolicy() {
  const policies = listPolicies();
  const union = new Set();
  let anyEnforce = false;
  let maxUpdatedAt = '';
  for (const p of policies) {
    for (const h of p.allowlist) union.add(h);
    if (p.mode === 'enforce') anyEnforce = true;
    if (p.updatedAt > maxUpdatedAt) maxUpdatedAt = p.updatedAt;
  }
  return {
    version: policies.length > 0 ? policies.reduce((max, p) => Math.max(max, p.id), 0) : 0,
    mode: policies.length === 0 ? 'enforce' : (anyEnforce ? 'enforce' : 'audit-only'),
    allowlist: Array.from(union).sort(),
    updated_at: maxUpdatedAt || new Date().toISOString(),
  };
}

/**
 * Write the merged policy.json to disk atomically, then invoke the SIGHUP hook.
 * Called after every create/update/remove. Safe to call even when the sidecar
 * isn't running — write succeeds, SIGHUP hook silently skips.
 */
function writePolicyFile() {
  const p = _buildAggregatePolicy();
  const filePath = _policyPath();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(p, null, 2), { mode: 0o640 });
    fs.renameSync(tmp, filePath);  // atomic on same filesystem (preflight P6)
    log.info('Sidecar policy.json written', { path: filePath, version: p.version, mode: p.mode, allowlistSize: p.allowlist.length });
  } catch (e) {
    log.warn('Failed to write policy.json (non-fatal)', { path: filePath, error: e.message });
    return false;
  }
  if (_onPolicyWritten) {
    try { _onPolicyWritten(p); } catch (e) { log.warn('onPolicyWritten hook threw', { error: e.message }); }
  }
  return true;
}

function pruneOldBlockLog({ keepDays = 30, maxRows = 10_000 } = {}) {
  const db = getDb();
  db.prepare(`DELETE FROM egress_block_log WHERE blocked_at < datetime('now', ?)`).run(`-${Number(keepDays)} days`);
  const total = db.prepare('SELECT COUNT(*) AS n FROM egress_block_log').get().n;
  if (total > maxRows) {
    db.prepare(`
      DELETE FROM egress_block_log
      WHERE id IN (SELECT id FROM egress_block_log ORDER BY id ASC LIMIT ?)
    `).run(total - maxRows);
  }
}

// ─── Internals ──────────────────────────────────────────

function _mapRow(r) {
  return {
    id: r.id,
    scopeType: r.scope_type,
    scopeKey: r.scope_key,
    hostId: r.host_id,
    preset: r.preset,
    allowlist: JSON.parse(r.allowlist || '[]'),
    mode: r.mode,
    active: r.active === 1,
    createdAt: r.created_at,
    createdBy: r.created_by,
    updatedAt: r.updated_at,
  };
}

module.exports = {
  // Lookup
  listPresets,
  listPolicies,
  getPolicy,
  getPolicyForScope,
  // Mutations
  createPolicy,
  updatePolicy,
  removePolicy,
  // Preconditions
  canApplyFilter,
  // Block log
  getBlockLog,
  recordBlockedAttempt,
  pruneOldBlockLog,
  // Sidecar wiring (v6.7.0-alpha.2)
  writePolicyFile,
  setOnPolicyWritten,
  // Internals for tests
  _internals: { PRESETS, IMDS_ENDPOINTS, REFUSING_CAPS, resolvePreset, validateAllowlistEntry, dedupe, _buildAggregatePolicy },
};
