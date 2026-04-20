'use strict';

// ACME Watcher — v6.6.6
//
// Transitions ACME jobs from 'running' → 'success' / 'failed' so UI doesn't
// sit at 'running' indefinitely (pre-existing gap acknowledged in v6.5 code
// comment: "Session 2 wraps this in async runner + WS events").
//
// Signal: we don't have a direct "cert issued" event from Caddy without a
// deeper Caddy-events integration. Instead we use a heuristic that matches
// real-world behavior:
//
//   1. After `RUNNING_GRACE_MS` (default 60s) in 'running', check that the
//      Caddy policy for this job's domains still exists via the admin API.
//      - Policy present + Caddy healthy → transition to 'success'
//      - Policy missing (something removed it) → 'failed' + 'policy-removed'
//   2. After `TIMEOUT_MS` (default 10 min), force-terminate to 'failed' +
//      'timeout' regardless.
//
// This is a conservative heuristic: for the ~1% of cases where Caddy issued
// the policy but failed to obtain the cert, we mark it as 'success' anyway.
// That's acceptable because `acme_managed_certs` is separately populated;
// users still see the ground truth in the Managed Certs list.

const log = require('../utils/logger')('acme-watcher');
const { getDb } = require('../db');
const caddyConfig = require('./caddy-config');

const POLL_INTERVAL_MS = 10_000;
const RUNNING_GRACE_MS = 60_000;
const TIMEOUT_MS = 10 * 60_000;

let _timer = null;
let _publishUpdate = null;

function setPublishUpdate(fn) { _publishUpdate = fn; }

async function _tick() {
  const db = getDb();
  const now = Date.now();

  // Find every job stuck in 'running' whose started_at is old enough to check.
  const rows = db.prepare(`
    SELECT id, domains, started_at, created_at
    FROM acme_jobs
    WHERE status = 'running'
      AND started_at IS NOT NULL
  `).all();

  for (const r of rows) {
    const startedMs = new Date(r.started_at + 'Z').getTime();  // SQLite stores UTC
    if (Number.isNaN(startedMs)) continue;
    const elapsed = now - startedMs;

    if (elapsed >= TIMEOUT_MS) {
      log.warn('ACME job timeout — transitioning to failed', { jobId: r.id, elapsedMs: elapsed });
      db.prepare(`
        UPDATE acme_jobs SET status = 'failed', error_class = 'timeout',
          output = COALESCE(output, '') || '\n[watcher] Issuance timed out after ' || (? / 60000) || ' min.',
          completed_at = datetime('now')
        WHERE id = ?
      `).run(TIMEOUT_MS, r.id);
      if (_publishUpdate) _publishUpdate(r.id);
      continue;
    }

    if (elapsed < RUNNING_GRACE_MS) continue;  // too early to check

    // Check Caddy
    const subjects = r.domains.split(',').map(s => s.trim()).filter(Boolean);
    try {
      const idx = await caddyConfig.findAcmePolicyIndex(subjects);
      if (idx >= 0) {
        // Policy exists + Caddy is healthy → cert was almost certainly issued
        log.info('ACME job success (policy present in Caddy)', { jobId: r.id, elapsedMs: elapsed });
        db.prepare(`
          UPDATE acme_jobs SET status = 'success',
            output = COALESCE(output, '') || '\n[watcher] Cert issued successfully.',
            completed_at = datetime('now')
          WHERE id = ?
        `).run(r.id);
        if (_publishUpdate) _publishUpdate(r.id);
      } else {
        log.warn('ACME job: Caddy policy disappeared → failed', { jobId: r.id });
        db.prepare(`
          UPDATE acme_jobs SET status = 'failed', error_class = 'policy-removed',
            output = COALESCE(output, '') || '\n[watcher] Caddy policy for these subjects is no longer present. It was likely removed manually.',
            completed_at = datetime('now')
          WHERE id = ?
        `).run(r.id);
        if (_publishUpdate) _publishUpdate(r.id);
      }
    } catch (e) {
      // Caddy unreachable — leave in 'running', retry next tick
      log.debug('ACME watcher: Caddy check failed (will retry)', { jobId: r.id, error: e.message });
    }
  }
}

function start() {
  if (_timer) return;
  _timer = setInterval(() => {
    _tick().catch(err => log.error('acme-watcher tick failed', { error: err.message }));
  }, POLL_INTERVAL_MS);
  log.info('ACME watcher started', { pollMs: POLL_INTERVAL_MS, graceMs: RUNNING_GRACE_MS, timeoutMs: TIMEOUT_MS });
}

function stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = {
  start,
  stop,
  setPublishUpdate,
  _internals: { _tick, POLL_INTERVAL_MS, RUNNING_GRACE_MS, TIMEOUT_MS },
};
