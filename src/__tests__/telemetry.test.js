'use strict';

// WHY: Closing self-introduced test debt from the v8.2.x post-audit
// remediation pass.
//
// `src/services/telemetry.js` shipped as a SCAFFOLD in v8.2.x — the
// public API exists, call sites can be sprinkled around the codebase,
// but the module is OFF by default and the actual collector + Settings
// UI ship in v8.3.0. The danger of a scaffold is that nobody tests it,
// so the day v8.3.0 lands the contract has silently drifted.
//
// This suite locks down the v8.2.x scaffold contract so the v8.3.0
// upgrade can rip out the no-op branches without re-discovering the
// invariants:
//   1. Off by default (no settings row, or settings.value !== 'true').
//   2. emit() is a TRUE no-op when disabled — no network, no throw.
//   3. _ensureInstallId() is idempotent and persists into settings.
//   4. describePayload() returns the documented anonymous shape with
//      the "off by default" notice the Settings UI will render.
//
// If any of these break in a future commit, the regression is on us,
// not the user — telemetry that fires unexpectedly is a security
// incident in self-hosted land.

process.env.APP_SECRET = 'test-secret-key-for-jest-tests-only';
process.env.ENCRYPTION_KEY = 'test-encryption-key-for-jest-32chars';
process.env.DB_PATH = ':memory:';

const Database = require('better-sqlite3');

describe('Telemetry scaffold (v8.2.x — off by default)', () => {
  let db;
  let telemetry;

  beforeAll(() => {
    // Fresh in-memory DB with just the `settings` table the scaffold
    // needs — no migrations, keeps the test fast and decoupled.
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);

    // Re-require with a fresh module cache so internal `_enabled` and
    // `_installId` state don't leak in from any other suite.
    jest.resetModules();
    telemetry = require('../services/telemetry');
  });

  afterAll(() => {
    if (db) db.close();
  });

  beforeEach(() => {
    db.prepare('DELETE FROM settings').run();
    // Reset module-level state by reloading the module — the scaffold
    // caches `_enabled` and `_installId` between calls.
    jest.resetModules();
    telemetry = require('../services/telemetry');
  });

  // ── isEnabled() ────────────────────────────────────────────────────

  it('isEnabled returns false when settings row is missing', () => {
    expect(telemetry.isEnabled(db)).toBe(false);
  });

  it('isEnabled returns true ONLY when settings.telemetry_enabled = "true"', () => {
    db.prepare("INSERT INTO settings (key, value) VALUES ('telemetry_enabled', 'true')").run();
    expect(telemetry.isEnabled(db)).toBe(true);
  });

  it('isEnabled returns false for any non-"true" value (string "1", "yes", "TRUE")', () => {
    const ins = db.prepare(
      "INSERT INTO settings (key, value) VALUES ('telemetry_enabled', ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    );
    for (const v of ['1', 'yes', 'TRUE', 'false', '']) {
      ins.run(v);
      expect(telemetry.isEnabled(db)).toBe(false);
    }
  });

  it('isEnabled returns false (does not throw) when DB query fails', () => {
    const brokenDb = {
      prepare: () => {
        throw new Error('db gone');
      },
    };
    expect(telemetry.isEnabled(brokenDb)).toBe(false);
  });

  // ── emit() ─────────────────────────────────────────────────────────

  it('emit() is a no-op when disabled (returns undefined, does not throw)', () => {
    // Default state: _enabled is false (module just reloaded, no isEnabled call yet).
    expect(() => telemetry.emit('feature.x')).not.toThrow();
    expect(telemetry.emit('feature.x')).toBeUndefined();
  });

  it('emit() with feature + meta args still no-ops cleanly', () => {
    expect(() =>
      telemetry.emit('ai.audit-search', { provider: 'anthropic', count: 12 })
    ).not.toThrow();
    expect(telemetry.emit('pcloud.upload-db', { size: 1024 })).toBeUndefined();
  });

  it('emit() does not attempt any network call when disabled', () => {
    // Trip-wire: if anyone wires up real HTTP in v8.2.x by accident,
    // either http.request or https.request would be invoked. We spy on
    // both and assert zero calls.
    const http = require('http');
    const https = require('https');
    const httpSpy = jest.spyOn(http, 'request').mockImplementation(() => {
      throw new Error('telemetry must not hit the network in v8.2.x');
    });
    const httpsSpy = jest.spyOn(https, 'request').mockImplementation(() => {
      throw new Error('telemetry must not hit the network in v8.2.x');
    });

    telemetry.emit('feature.with.network', { foo: 'bar' });

    expect(httpSpy).not.toHaveBeenCalled();
    expect(httpsSpy).not.toHaveBeenCalled();

    httpSpy.mockRestore();
    httpsSpy.mockRestore();
  });

  // ── _ensureInstallId() ─────────────────────────────────────────────

  it('_ensureInstallId generates a UUID v4 on first call', () => {
    const id = telemetry._ensureInstallId(db);
    expect(typeof id).toBe('string');
    // RFC 4122 v4: xxxxxxxx-xxxx-4xxx-[8|9|a|b]xxx-xxxxxxxxxxxx
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('_ensureInstallId is idempotent — second call returns the same UUID', () => {
    const a = telemetry._ensureInstallId(db);
    const b = telemetry._ensureInstallId(db);
    const c = telemetry._ensureInstallId(db);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('_ensureInstallId persists the UUID into settings.telemetry_install_id', () => {
    const id = telemetry._ensureInstallId(db);
    const row = db.prepare("SELECT value FROM settings WHERE key = 'telemetry_install_id'").get();
    expect(row).toBeTruthy();
    expect(row.value).toBe(id);
  });

  it('_ensureInstallId reuses an existing settings row across module reloads', () => {
    const first = telemetry._ensureInstallId(db);
    // Simulate a process restart — module cache cleared, in-memory
    // `_installId` lost — but the DB row should still be honored.
    jest.resetModules();
    const reloaded = require('../services/telemetry');
    const second = reloaded._ensureInstallId(db);
    expect(second).toBe(first);
  });

  // ── describePayload() ──────────────────────────────────────────────

  it('describePayload returns the documented anonymous shape', () => {
    const p = telemetry.describePayload(db);
    expect(p).toMatchObject({
      install_id: expect.any(String),
      version: expect.any(String),
      mode: 'standalone',
      period_seconds: 86400,
      sample_event: {
        feature: expect.any(String),
        count: expect.any(Number),
        meta: expect.any(Object),
      },
      endpoint: expect.any(String),
      notice: expect.any(String),
    });
    // No PII keys
    expect(p).not.toHaveProperty('hostname');
    expect(p).not.toHaveProperty('username');
    expect(p).not.toHaveProperty('ip');
    expect(p).not.toHaveProperty('email');
  });

  it('describePayload notice mentions "v8.2.x scaffold" and "off by default"', () => {
    const p = telemetry.describePayload(db);
    expect(p.notice.toLowerCase()).toContain('off by default');
    expect(p.notice.toLowerCase()).toContain('v8.2.x');
  });

  it('describePayload accepts a non-default mode', () => {
    const p = telemetry.describePayload(db, 'ha');
    expect(p.mode).toBe('ha');
  });

  // ── Module loads cleanly with no DB available ──────────────────────

  it('module loads cleanly with no DB available (graceful degradation)', () => {
    // The module-load itself must never touch a DB. If it did, requiring
    // it before getDb() initialized would throw. We already required it
    // in beforeEach above without any DB hookup — survival is the test.
    expect(typeof telemetry.isEnabled).toBe('function');
    expect(typeof telemetry.emit).toBe('function');
    expect(typeof telemetry.describePayload).toBe('function');
    expect(typeof telemetry._ensureInstallId).toBe('function');

    // And isEnabled() called with a totally bogus "db" must not throw:
    expect(() => telemetry.isEnabled({})).not.toThrow();
    expect(telemetry.isEnabled({})).toBe(false);
  });
});
