'use strict';

// Egress block-log ingester — v6.7.0-rc1
//
// The sidecar (docker/egress-filter/main.go) writes denied attempts to
// /var/log/dd-egress/denied.log inside its own filesystem. This service
// tails that file via `docker exec` periodically and inserts new entries
// into the `egress_block_log` DB table so the UI can show history.
//
// Design choice (rc1): docker exec tail — no sidecar code change, uses the
// existing docker socket we already have, idempotent on restarts (tracks
// last-seen line per sidecar in a small in-memory offset table).
//
// Line format written by the sidecar:
//   2026-04-20T12:38:27Z host=example.com port=443 reason=not-in-allowlist
//
// Lines without a parseable timestamp are skipped (e.g. `ERROR` lines).

const log = require('../utils/logger')('egress-blocklog');
const dockerService = require('./docker');
const egressFilter = require('./egress-filter');

const POLL_INTERVAL_MS = Number(process.env.DD_EGRESS_BLOCKLOG_POLL_MS) || 30_000;
const SIDECAR_NAME = process.env.DD_EGRESS_SIDECAR_NAME || 'dd-egress-filter';
const TAIL_LINES = 500;
const LOG_PATH = '/var/log/dd-egress/denied.log';

// Per-sidecar offset: last line timestamp seen (as ISO string). Dedupes when
// the sidecar container hasn't rotated the log. Cleared if sidecar container
// restarts (we detect by cid change).
const _offset = new Map();  // key: sidecar_container_id → { lastTimestamp: string }

let _timer = null;

// ─── Parser ──────────────────────────────────────────

// Matches: "2026-04-20T12:38:27Z host=example.com port=443 reason=not-in-allowlist"
// OR with trailing log-format prefix from `log.Print` which adds "YYYY/MM/DD HH:MM:SS "
const LINE_RE = /(?:\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2} )?(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\s+host=(\S+)\s+port=(\S+)\s+reason=([^\s]+(?:[^\n\r]*)?)/;

function parseLine(line) {
  const m = line.match(LINE_RE);
  if (!m) return null;
  const [, ts, host, portStr, reason] = m;
  const port = parseInt(portStr, 10);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) return null;
  return { timestamp: ts, hostname: host, port, reason: reason.trim() };
}

// ─── Sidecar log reader ─────────────────────────────

async function _readSidecarLog(sidecarName = SIDECAR_NAME, hostId = 0) {
  const docker = dockerService.getDocker(hostId);
  const container = docker.getContainer(sidecarName);

  // Verify container exists + running
  let info;
  try {
    info = await container.inspect();
  } catch (e) {
    return { running: false, cid: null, lines: [] };
  }
  if (!info?.State?.Running) return { running: false, cid: info?.Id || null, lines: [] };

  // docker exec → tail the log file
  const exec = await container.exec({
    Cmd: ['tail', '-n', String(TAIL_LINES), LOG_PATH],
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = await exec.start({ hijack: true, stdin: false });
  const output = await new Promise((resolve) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });

  // Strip docker-exec stream-framing headers (8-byte header per frame).
  // Simpler: just look for lines matching our pattern; junk is auto-discarded.
  const lines = output.split(/\r?\n/).filter(Boolean);
  return { running: true, cid: info.Id, lines };
}

// ─── Policy-agnostic insertion ───────────────────────

// In alpha.4 the sidecar runs with a single aggregate policy (no per-source
// routing). So deny lines don't carry a container_id. We insert with
// container_id='' and attribute to ALL currently-active policies (the user's
// UI will filter visually).
//
// When rc1 adds per-container routing, the sidecar will include a
// `container=` field; we'll parse it and scope to one policy.

function _insertForAllActivePolicies(entry) {
  const policies = egressFilter.listPolicies();
  for (const p of policies) {
    egressFilter.recordBlockedAttempt({
      policyId: p.id,
      containerId: '',
      hostname: entry.hostname,
      port: entry.port,
      proto: 'tcp',  // sidecar only logs TCP today
      reason: entry.reason,
    });
  }
}

// ─── Main tick ───────────────────────────────────────

async function _tick() {
  let result;
  try {
    result = await _readSidecarLog();
  } catch (e) {
    log.debug('sidecar log read failed', { error: e.message });
    return { processed: 0, skipped: 0 };
  }
  if (!result.running || result.lines.length === 0) return { processed: 0, skipped: 0 };

  const offsetEntry = _offset.get(result.cid) || { lastTimestamp: '' };
  let processed = 0;
  let skipped = 0;
  let newestTs = offsetEntry.lastTimestamp;

  for (const line of result.lines) {
    const entry = parseLine(line);
    if (!entry) { skipped++; continue; }
    if (offsetEntry.lastTimestamp && entry.timestamp <= offsetEntry.lastTimestamp) {
      skipped++;
      continue;  // already seen in a previous tick
    }
    try {
      _insertForAllActivePolicies(entry);
      processed++;
      if (entry.timestamp > newestTs) newestTs = entry.timestamp;
    } catch (e) {
      log.debug('insert failed', { hostname: entry.hostname, error: e.message });
      skipped++;
    }
  }

  _offset.set(result.cid, { lastTimestamp: newestTs });

  if (processed > 0) {
    log.info('Egress block log ingested', { cid: result.cid, processed, skipped });
  }
  return { processed, skipped };
}

function start() {
  if (_timer) return;
  _timer = setInterval(() => {
    _tick().catch((err) => log.error('egress-blocklog tick failed', { error: err.message }));
  }, POLL_INTERVAL_MS);
  log.info('Egress block log ingester started', { pollMs: POLL_INTERVAL_MS, sidecar: SIDECAR_NAME });
}

function stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
  _offset.clear();
}

module.exports = {
  start,
  stop,
  _internals: { _tick, parseLine, _insertForAllActivePolicies, POLL_INTERVAL_MS, LOG_PATH },
};
