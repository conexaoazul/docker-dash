'use strict';

// Sample feature service — v7.4.0 — CONTRIBUTOR DEMO
//
// This is a deliberate, minimal example showing the Docker Dash service
// pattern. A real feature would do real work; this one just persists a
// counter to the settings table so contributors can see every layer
// (service → route → page → WS → cron → audit → tests) end-to-end without
// having to model a domain.
//
// Counterpart files (the full pattern):
//   src/routes/sample-feature.js          — REST endpoints
//   src/jobs/index.js                     — cron entry that calls .tick()
//   public/js/pages/sample-feature.js     — the live demo page
//   src/__tests__/sample-feature.test.js  — unit tests
//
// See examples/sample-feature/README.md for the step-by-step walkthrough.

const settings = require('./settings');
const log = require('../utils/logger')('sample-feature');

const SETTING_KEY = 'sample_feature_counter';

let _wsBroadcaster = null;  // wired by server.js after ws.attach()

/**
 * Wire the WebSocket broadcaster. Called once at server startup. The page
 * subscribes to `sample-feature:counter` and re-renders on every push.
 *
 * @param {(type: string, data: object, channel: string) => void} fn
 */
function setWsBroadcaster(fn) {
  _wsBroadcaster = fn;
}

/**
 * Read the current counter value. Returns 0 when nothing is stored yet.
 * @returns {number}
 */
function getCount() {
  const raw = settings.get(SETTING_KEY, '0');
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Increment the counter by 1 and broadcast the new value.
 *
 * @param {object} [opts]
 * @param {string} [opts.source] — 'manual' | 'cron' | 'reset'. Echoed in
 *                                 the WS payload so the UI can label it.
 * @returns {{ count: number, source: string }}
 */
function increment(opts = {}) {
  const source = opts.source || 'manual';
  const next = getCount() + 1;
  settings.set(SETTING_KEY, String(next));
  _broadcast({ count: next, source });
  return { count: next, source };
}

/**
 * Reset the counter to 0 (admin-gated at the route layer).
 * @returns {{ count: 0, source: 'reset' }}
 */
function reset() {
  settings.set(SETTING_KEY, '0');
  _broadcast({ count: 0, source: 'reset' });
  log.info('Counter reset');
  return { count: 0, source: 'reset' };
}

/**
 * Cron entry — called once per minute by jobs/index.js (leader-only in
 * HA mode). Bumps the counter so contributors see the cron pattern fire
 * without having to wait for some external event.
 */
function tick() {
  return increment({ source: 'cron' });
}

function _broadcast(payload) {
  if (!_wsBroadcaster) return;
  try {
    _wsBroadcaster('sample-feature:counter', payload, 'sample-feature:counter');
  } catch (err) {
    log.warn('Broadcast failed', { error: err.message });
  }
}

module.exports = {
  setWsBroadcaster,
  getCount,
  increment,
  reset,
  tick,
  _internals: { SETTING_KEY },
};
