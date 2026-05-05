'use strict';

// v8.3.0-prep — Anonymous opt-in telemetry scaffold.
//
// PURPOSE: close the feedback loop. Self-hosted dashboards have zero signal
// about which features get used in real installs. Without it, the v8.x
// roadmap is "what the maintainer wants" rather than "what users ask for"
// (called out in the post-v8.2.0 audit).
//
// DESIGN PRINCIPLES (non-negotiable):
//   1. Off by default. Operator must explicitly enable in Settings.
//   2. No PII. No usernames, no IPs, no container names, no host info.
//   3. Self-reported version + feature counters only. No payloads.
//   4. Anonymous install ID. Random UUID generated once and persisted.
//      Cannot be used to track an individual operator across installs.
//   5. Endpoint URL is configurable. Defaults to a Docker Dash-hosted
//      collector — operators can point it at their own collector or null.
//   6. Single HTTP POST per event. Best-effort, fire-and-forget.
//      Never blocks user flow.
//   7. Visible in audit log. Every send writes a `telemetry_send` audit
//      entry with what was sent (no secret leak — payload is the same
//      anonymous data already documented).
//
// WHAT WE TRACK (when enabled):
//   - install ID (anonymous UUID)
//   - version
//   - feature_used: feature_name, count_in_period
//   - mode: standalone | ha
//   - container_count_bucket: 0 | 1-5 | 6-20 | 21-50 | 51+
//   - install_age_days_bucket: 0-7 | 8-30 | 31-90 | 91-365 | 365+
//
// WHAT WE NEVER TRACK:
//   - usernames, emails, IPs, container/host/stack names
//   - audit log entries (those stay local)
//   - error stack traces (those stay local)
//   - any prompt sent to AI providers
//
// IMPLEMENTATION STATUS (as of 2026-05-05): scaffold only. The actual
// collector endpoint, the Settings UI toggle, and the periodic emit cron
// ship in v8.3.0 once the design is signed off. Until then, this module
// loads cleanly, exports the public API, and is a no-op.

const crypto = require('crypto');
const log = require('../utils/logger')('telemetry');

const DEFAULT_ENDPOINT = ''; // empty = disabled until v8.3.0

let _enabled = false;
let _installId = null;

function _ensureInstallId(db) {
  if (_installId) return _installId;
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'telemetry_install_id'").get();
    if (row?.value) {
      _installId = row.value;
      return _installId;
    }
    const newId = crypto.randomUUID();
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('telemetry_install_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run(newId);
    _installId = newId;
    return newId;
  } catch (err) {
    log.debug('Telemetry install ID unavailable', err.message);
    return null;
  }
}

/** Read enabled flag from settings table. Off by default. */
function isEnabled(db) {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'telemetry_enabled'").get();
    _enabled = row?.value === 'true';
    return _enabled;
  } catch {
    return false;
  }
}

/**
 * Public emit function. No-op when telemetry is disabled or no endpoint
 * configured. Call sites add `require('../services/telemetry').emit(...)`
 * around features whose usage we want to count.
 *
 * @param {string} feature - feature identifier (e.g., 'ai.audit-search', 'pcloud.upload-db')
 * @param {object} [meta] - optional flat key/value bag, no secrets, will be JSON-stringified
 */
function emit(feature, meta = {}) {
  if (!_enabled) return;
  // v8.3.0 will: queue the event, batch every N minutes, POST to collector.
  // For v8.2.x we just record the call shape so site call-sites can be
  // sprinkled in features without breaking anything.
  log.debug('telemetry.emit (disabled in v8.2.x)', { feature, meta });
}

/**
 * Test-helper: surface the configured shape of a telemetry payload so the
 * Settings UI can show "if you enable this, the next send will look like:".
 */
function describePayload(db, mode = 'standalone') {
  return {
    install_id: _ensureInstallId(db) || '<no-id>',
    version: require('../version'),
    mode,
    period_seconds: 86400,
    sample_event: {
      feature: 'ai.audit-search',
      count: 12,
      meta: { provider: 'anthropic' },
    },
    endpoint: DEFAULT_ENDPOINT || '<no endpoint configured — v8.2.x scaffold only>',
    notice:
      'Anonymous. Off by default. Off-the-record: this scaffold landed in v8.2.x; the collector + Settings UI ship in v8.3.0 once the design is signed off.',
  };
}

module.exports = {
  isEnabled,
  emit,
  describePayload,
  _ensureInstallId,
};
