'use strict';

// Update check — v7.3.0
//
// Polls GitHub Releases for the latest published Docker Dash release and
// compares it against the running version. Result is cached in the settings
// table so repeated UI loads don't hit GitHub. Default poll cadence (driven
// by jobs.js): every 12 hours.
//
// Privacy + air-gap: this is the ONLY outbound call made by Docker Dash to
// a non-user-controlled host. It can be disabled via System Settings →
// Update Notifications. When disabled, getStatus() returns enabled:false +
// the last cached payload (frozen). The job skips the network call.

const https = require('https');
const settings = require('./settings');
const log = require('../utils/logger')('update-check');
const _appVersion = require('../version');

const GITHUB_OWNER = process.env.DD_UPDATE_CHECK_OWNER || 'bogdanpricop';
const GITHUB_REPO = process.env.DD_UPDATE_CHECK_REPO || 'docker-dash';
const SETTING_ENABLED = 'update_check_enabled';
const SETTING_CACHE = 'update_check_cache';
const FETCH_TIMEOUT_MS = 5000;
const MIN_REFRESH_INTERVAL_MS = 60 * 1000;  // anti-abuse for manual /refresh

let _lastRefreshAttempt = 0;

function _parseSemver(tag) {
  if (!tag) return null;
  const m = String(tag).replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

function _compareSemver(a, b) {
  if (!a || !b) return 0;
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function _readCache() {
  const raw = settings.get(SETTING_CACHE, null);
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch { return null; }
}

function _writeCache(payload) {
  settings.set(SETTING_CACHE, JSON.stringify(payload));
}

function isEnabled() {
  // Default ON. Setting stores '1' / '0'.
  return settings.get(SETTING_ENABLED, '1') !== '0';
}

function setEnabled(value, userId = null) {
  settings.set(SETTING_ENABLED, value ? '1' : '0', userId);
}

/**
 * Fetch latest release from GitHub. Pure HTTP — no caching, no DB writes.
 * Returns parsed body on success, throws on network/HTTP error.
 */
function _fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const options = {
      method: 'GET',
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      headers: {
        'User-Agent': `docker-dash/${_appVersion}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      timeout: FETCH_TIMEOUT_MS,
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode !== 200) {
          return reject(new Error(`GitHub API ${res.statusCode}: ${body.substring(0, 200)}`));
        }
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`Malformed GitHub response: ${e.message}`)); }
      });
    });
    req.on('error', (err) => reject(new Error(`Network error: ${err.message}`)));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`GitHub API timed out (${FETCH_TIMEOUT_MS}ms)`));
    });
    req.end();
  });
}

/**
 * Refresh the cache. Returns the new cache payload on success, or null when
 * skipped (rate-limited or disabled). Network errors are caught + logged;
 * the cache is left untouched (so the UI shows the previous result).
 *
 * @param {object} [opts]
 * @param {boolean} [opts.force=false] - bypass the 1-minute throttle
 */
async function refresh(opts = {}) {
  if (!isEnabled()) return null;
  const now = Date.now();
  if (!opts.force && (now - _lastRefreshAttempt) < MIN_REFRESH_INTERVAL_MS) {
    return null;
  }
  _lastRefreshAttempt = now;

  let release;
  try {
    release = await _fetchLatestRelease();
  } catch (err) {
    log.warn('GitHub release fetch failed', { error: err.message });
    return null;
  }

  const payload = {
    latestTag: release.tag_name || '',
    latestName: release.name || release.tag_name || '',
    releaseNotes: typeof release.body === 'string' ? release.body : '',
    releaseUrl: release.html_url || '',
    publishedAt: release.published_at || '',
    fetchedAt: new Date().toISOString(),
  };
  _writeCache(payload);
  log.info('Update check refreshed', {
    latest: payload.latestTag,
    current: _appVersion,
    notesLength: payload.releaseNotes.length,
  });
  return payload;
}

/**
 * Read the current status — non-blocking. The frontend calls this on every
 * sidebar mount; refresh happens in the background job (and on first call
 * when no cache exists).
 *
 * @returns {{
 *   current: string,
 *   latest: string|null,
 *   hasUpdate: boolean,
 *   releaseNotes: string,
 *   releaseUrl: string,
 *   publishedAt: string,
 *   lastChecked: string|null,
 *   enabled: boolean,
 * }}
 */
function getStatus() {
  const enabled = isEnabled();
  const cache = _readCache();

  const current = _appVersion;
  const latestTag = cache?.latestTag || null;
  const latestSv = _parseSemver(latestTag);
  const currentSv = _parseSemver(current);
  const hasUpdate = !!(enabled && latestSv && currentSv && _compareSemver(latestSv, currentSv) > 0);

  return {
    current,
    latest: latestTag,
    hasUpdate,
    releaseNotes: cache?.releaseNotes || '',
    releaseUrl: cache?.releaseUrl || `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`,
    publishedAt: cache?.publishedAt || '',
    lastChecked: cache?.fetchedAt || null,
    enabled,
  };
}

module.exports = {
  isEnabled,
  setEnabled,
  refresh,
  getStatus,
  // exported for testing
  _internals: { _parseSemver, _compareSemver, _fetchLatestRelease, GITHUB_OWNER, GITHUB_REPO },
};
