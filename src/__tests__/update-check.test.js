'use strict';

// Tests for src/services/update-check.js (v7.3.0)

process.env.APP_SECRET = 'test-secret-key-for-jest-tests-only';
process.env.DB_PATH = ':memory:';

jest.resetModules();

const { EventEmitter } = require('events');

describe('update-check service', () => {
  let db, settings, updateCheck, https;

  beforeAll(() => {
    const { getDb } = require('../db');
    db = getDb();
    settings = require('../services/settings');
    updateCheck = require('../services/update-check');
    https = require('https');
    db.prepare(
      `INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (1, 'admin', 'x', 'admin')`
    ).run();
  });

  afterAll(() => {
    const { closeDb } = require('../db');
    closeDb();
  });

  beforeEach(() => {
    db.prepare('DELETE FROM settings').run();
    // Reset internal throttle so each test can call refresh()
    updateCheck._internals.GITHUB_OWNER;  // touch to keep ref alive
  });

  // ─── semver helpers ────────────────────────────────────────────
  describe('_parseSemver', () => {
    const { _parseSemver } = updateCheck = require('../services/update-check')._internals;

    it('parses plain x.y.z', () => {
      expect(_parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    });

    it('strips leading v', () => {
      expect(_parseSemver('v7.3.0')).toEqual({ major: 7, minor: 3, patch: 0 });
    });

    it('handles prerelease + build suffixes', () => {
      expect(_parseSemver('v7.3.0-rc.1')).toEqual({ major: 7, minor: 3, patch: 0 });
      expect(_parseSemver('v7.3.0+abc')).toEqual({ major: 7, minor: 3, patch: 0 });
    });

    it('returns null for malformed input', () => {
      expect(_parseSemver('garbage')).toBeNull();
      expect(_parseSemver('')).toBeNull();
      expect(_parseSemver(null)).toBeNull();
      expect(_parseSemver('1.2')).toBeNull();
    });
  });

  describe('_compareSemver', () => {
    const { _compareSemver, _parseSemver } = require('../services/update-check')._internals;

    it('returns positive when a > b (major)', () => {
      expect(_compareSemver(_parseSemver('2.0.0'), _parseSemver('1.99.99'))).toBeGreaterThan(0);
    });

    it('returns positive when a > b (minor)', () => {
      expect(_compareSemver(_parseSemver('1.3.0'), _parseSemver('1.2.99'))).toBeGreaterThan(0);
    });

    it('returns positive when a > b (patch)', () => {
      expect(_compareSemver(_parseSemver('1.2.4'), _parseSemver('1.2.3'))).toBeGreaterThan(0);
    });

    it('returns 0 for equal versions', () => {
      expect(_compareSemver(_parseSemver('7.3.0'), _parseSemver('7.3.0'))).toBe(0);
    });

    it('returns 0 when either side is null', () => {
      expect(_compareSemver(null, _parseSemver('1.0.0'))).toBe(0);
      expect(_compareSemver(_parseSemver('1.0.0'), null)).toBe(0);
    });
  });

  // ─── enabled toggle ────────────────────────────────────────────
  describe('isEnabled / setEnabled', () => {
    const updateCheck = require('../services/update-check');

    it('defaults to true when no setting stored', () => {
      expect(updateCheck.isEnabled()).toBe(true);
    });

    it('respects a stored "0" as disabled', () => {
      updateCheck.setEnabled(false);
      expect(updateCheck.isEnabled()).toBe(false);
    });

    it('round-trips true → false → true', () => {
      updateCheck.setEnabled(true);
      expect(updateCheck.isEnabled()).toBe(true);
      updateCheck.setEnabled(false);
      expect(updateCheck.isEnabled()).toBe(false);
      updateCheck.setEnabled(true);
      expect(updateCheck.isEnabled()).toBe(true);
    });
  });

  // ─── getStatus ─────────────────────────────────────────────────
  describe('getStatus', () => {
    const updateCheck = require('../services/update-check');

    it('returns enabled:true and no update when cache is empty', () => {
      const status = updateCheck.getStatus();
      expect(status.enabled).toBe(true);
      expect(status.hasUpdate).toBe(false);
      expect(status.latest).toBeNull();
      expect(status.current).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('returns hasUpdate:false when cached latest equals current', () => {
      const current = require('../version');
      settings.set('update_check_cache', JSON.stringify({
        latestTag: 'v' + current,
        latestName: 'v' + current,
        releaseNotes: 'Notes here',
        releaseUrl: 'https://github.com/foo/bar/releases/tag/v' + current,
        publishedAt: '2026-04-25T00:00:00Z',
        fetchedAt: '2026-04-25T01:00:00Z',
      }));
      const status = updateCheck.getStatus();
      expect(status.hasUpdate).toBe(false);
      expect(status.latest).toBe('v' + current);
      expect(status.releaseNotes).toBe('Notes here');
    });

    it('returns hasUpdate:true when cached latest is greater than current', () => {
      settings.set('update_check_cache', JSON.stringify({
        latestTag: 'v999.0.0',
        latestName: 'Future',
        releaseNotes: '## Big release',
        releaseUrl: 'https://github.com/foo/bar/releases/tag/v999.0.0',
        publishedAt: '2099-01-01T00:00:00Z',
        fetchedAt: '2099-01-02T00:00:00Z',
      }));
      const status = updateCheck.getStatus();
      expect(status.hasUpdate).toBe(true);
      expect(status.latest).toBe('v999.0.0');
    });

    it('returns hasUpdate:false when feature is disabled, even with newer cached version', () => {
      updateCheck.setEnabled(false);
      settings.set('update_check_cache', JSON.stringify({
        latestTag: 'v999.0.0', latestName: 'X', releaseNotes: '', releaseUrl: '',
        publishedAt: '', fetchedAt: '',
      }));
      const status = updateCheck.getStatus();
      expect(status.enabled).toBe(false);
      expect(status.hasUpdate).toBe(false);
      // Cached data still surfaces (operator can still read what was learned)
      expect(status.latest).toBe('v999.0.0');
    });

    it('falls back to a sensible release URL when cache is empty', () => {
      const status = updateCheck.getStatus();
      expect(status.releaseUrl).toMatch(/^https:\/\/github\.com\/.+\/releases$/);
    });

    it('tolerates corrupt JSON in the cache (returns no-update state)', () => {
      settings.set('update_check_cache', '{not json');
      const status = updateCheck.getStatus();
      expect(status.hasUpdate).toBe(false);
      expect(status.latest).toBeNull();
    });
  });

  // ─── refresh (HTTP) ────────────────────────────────────────────
  describe('refresh', () => {
    let updateCheck, settingsSvc, requestSpy;

    beforeEach(() => {
      // Drop only the update-check module so the in-process throttle resets;
      // re-require settings from the SAME cache so reads see the same DB state
      delete require.cache[require.resolve('../services/update-check')];
      updateCheck = require('../services/update-check');
      settingsSvc = require('../services/settings');
      const { getDb } = require('../db');
      getDb().prepare('DELETE FROM settings').run();
    });

    afterEach(() => {
      if (requestSpy) requestSpy.mockRestore();
    });

    function _mockHttpsResponse(statusCode, body) {
      const fakeReq = new EventEmitter();
      fakeReq.write = jest.fn();
      fakeReq.destroy = jest.fn();
      fakeReq.end = jest.fn(() => {
        setImmediate(() => {
          const res = new EventEmitter();
          res.statusCode = statusCode;
          if (fakeReq._cb) fakeReq._cb(res);
          setImmediate(() => {
            res.emit('data', Buffer.from(body));
            res.emit('end');
          });
        });
      });
      return fakeReq;
    }

    it('fetches from GitHub, writes cache, returns payload', async () => {
      const captured = {};
      requestSpy = jest.spyOn(https, 'request').mockImplementation((opts, cb) => {
        captured.opts = opts;
        const req = _mockHttpsResponse(200, JSON.stringify({
          tag_name: 'v9.9.9',
          name: 'v9.9.9 — Future',
          body: '## Notes\n- A\n- B',
          html_url: 'https://github.com/foo/bar/releases/tag/v9.9.9',
          published_at: '2026-04-25T12:00:00Z',
        }));
        req._cb = cb;
        return req;
      });

      const out = await updateCheck.refresh({ force: true });

      expect(captured.opts.hostname).toBe('api.github.com');
      expect(captured.opts.path).toMatch(/\/releases\/latest$/);
      expect(captured.opts.headers['User-Agent']).toMatch(/^docker-dash\//);
      expect(captured.opts.headers['Accept']).toBe('application/vnd.github+json');
      expect(out.latestTag).toBe('v9.9.9');
      expect(out.releaseNotes).toContain('Notes');

      // Cache was written
      const cached = settingsSvc.get('update_check_cache');
      expect(JSON.parse(cached).latestTag).toBe('v9.9.9');
    });

    it('returns null when feature is disabled (no HTTP call)', async () => {
      updateCheck.setEnabled(false);
      requestSpy = jest.spyOn(https, 'request').mockImplementation(() => {
        throw new Error('should not be called when disabled');
      });
      const out = await updateCheck.refresh({ force: true });
      expect(out).toBeNull();
    });

    it('returns null + leaves cache untouched on network error', async () => {
      // Pre-populate a stale cache so we can verify it survives
      settingsSvc.set('update_check_cache', JSON.stringify({
        latestTag: 'v1.0.0', latestName: '', releaseNotes: '', releaseUrl: '',
        publishedAt: '', fetchedAt: '2025-01-01T00:00:00Z',
      }));

      requestSpy = jest.spyOn(https, 'request').mockImplementation(() => {
        const req = new EventEmitter();
        req.write = jest.fn();
        req.destroy = jest.fn();
        req.end = jest.fn(() => setImmediate(() => req.emit('error', new Error('ECONNREFUSED'))));
        return req;
      });

      const out = await updateCheck.refresh({ force: true });
      expect(out).toBeNull();
      const cached = JSON.parse(settingsSvc.get('update_check_cache'));
      expect(cached.latestTag).toBe('v1.0.0');  // unchanged
    });

    it('returns null on non-200 GitHub response', async () => {
      requestSpy = jest.spyOn(https, 'request').mockImplementation((opts, cb) => {
        const req = _mockHttpsResponse(403, '{"message":"rate limit"}');
        req._cb = cb;
        return req;
      });
      const out = await updateCheck.refresh({ force: true });
      expect(out).toBeNull();
    });

    it('force:true bypasses the throttle', async () => {
      let calls = 0;
      requestSpy = jest.spyOn(https, 'request').mockImplementation((opts, cb) => {
        calls++;
        const req = _mockHttpsResponse(200, JSON.stringify({
          tag_name: 'v9.9.9', body: '', html_url: '', published_at: '',
        }));
        req._cb = cb;
        return req;
      });

      await updateCheck.refresh({ force: true });
      await updateCheck.refresh({ force: true });
      expect(calls).toBe(2);
    });

    it('tolerates a missing body field in the GitHub response', async () => {
      requestSpy = jest.spyOn(https, 'request').mockImplementation((opts, cb) => {
        const req = _mockHttpsResponse(200, JSON.stringify({
          tag_name: 'v9.9.9',
          html_url: 'https://github.com/foo/bar/releases/tag/v9.9.9',
        }));
        req._cb = cb;
        return req;
      });
      const out = await updateCheck.refresh({ force: true });
      expect(out.latestTag).toBe('v9.9.9');
      expect(out.releaseNotes).toBe('');  // empty string, not null
    });
  });
});
