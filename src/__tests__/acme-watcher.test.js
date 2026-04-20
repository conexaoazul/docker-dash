'use strict';

// Tests for the ACME watcher — transitions stuck 'running' jobs to success/failed.

process.env.APP_SECRET = 'test-secret-for-acme-watcher';
process.env.APP_ENV = 'test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-for-jest-32chars';
process.env.DB_PATH = ':memory:';
process.env.ADMIN_PASSWORD = 'WatcherTest123!';

const { getDb } = require('../db');
getDb();  // triggers migrations

const acmeWatcher = require('../services/acme-watcher');

// Stub the Caddy API — we don't want to hit a socket in tests.
jest.mock('../services/caddy-config', () => ({
  findAcmePolicyIndex: jest.fn(),
}));
const caddyConfig = require('../services/caddy-config');

function insertJob({ domains = 'a.test.com', status = 'running', ageMs = 0 } = {}) {
  const started = ageMs > 0 ? new Date(Date.now() - ageMs).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '') : null;
  const row = getDb().prepare(`
    INSERT INTO acme_jobs (domains, challenge_type, staging, status, started_at, created_at)
    VALUES (?, 'http-01', 0, ?, ?, datetime('now'))
  `).run(domains, status, started);
  return row.lastInsertRowid;
}

describe('acme-watcher._tick', () => {
  beforeEach(() => {
    getDb().prepare('DELETE FROM acme_jobs').run();
    caddyConfig.findAcmePolicyIndex.mockReset();
  });

  it('leaves jobs younger than RUNNING_GRACE_MS alone', async () => {
    const id = insertJob({ ageMs: 10_000 });  // 10s — under 60s grace
    caddyConfig.findAcmePolicyIndex.mockResolvedValue(0);
    await acmeWatcher._internals._tick();
    const row = getDb().prepare('SELECT status FROM acme_jobs WHERE id = ?').get(id);
    expect(row.status).toBe('running');
    expect(caddyConfig.findAcmePolicyIndex).not.toHaveBeenCalled();
  });

  it('transitions to success when policy is present after grace period', async () => {
    const id = insertJob({ ageMs: 70_000 });  // 70s — past 60s grace
    caddyConfig.findAcmePolicyIndex.mockResolvedValue(2);
    await acmeWatcher._internals._tick();
    const row = getDb().prepare('SELECT status, output FROM acme_jobs WHERE id = ?').get(id);
    expect(row.status).toBe('success');
    expect(row.output).toMatch(/issued successfully/);
  });

  it('transitions to failed (policy-removed) when policy is missing after grace', async () => {
    const id = insertJob({ ageMs: 70_000 });
    caddyConfig.findAcmePolicyIndex.mockResolvedValue(-1);
    await acmeWatcher._internals._tick();
    const row = getDb().prepare('SELECT status, error_class FROM acme_jobs WHERE id = ?').get(id);
    expect(row.status).toBe('failed');
    expect(row.error_class).toBe('policy-removed');
  });

  it('times out jobs older than TIMEOUT_MS without calling Caddy', async () => {
    const id = insertJob({ ageMs: 11 * 60_000 });  // 11 min
    await acmeWatcher._internals._tick();
    const row = getDb().prepare('SELECT status, error_class FROM acme_jobs WHERE id = ?').get(id);
    expect(row.status).toBe('failed');
    expect(row.error_class).toBe('timeout');
    expect(caddyConfig.findAcmePolicyIndex).not.toHaveBeenCalled();
  });

  it('ignores jobs not in running state', async () => {
    const id = insertJob({ status: 'success', ageMs: 70_000 });
    await acmeWatcher._internals._tick();
    const row = getDb().prepare('SELECT status FROM acme_jobs WHERE id = ?').get(id);
    expect(row.status).toBe('success');
    expect(caddyConfig.findAcmePolicyIndex).not.toHaveBeenCalled();
  });

  it('keeps jobs in running when Caddy is unreachable (retries next tick)', async () => {
    const id = insertJob({ ageMs: 70_000 });
    caddyConfig.findAcmePolicyIndex.mockRejectedValue(new Error('ECONNREFUSED'));
    await acmeWatcher._internals._tick();
    const row = getDb().prepare('SELECT status FROM acme_jobs WHERE id = ?').get(id);
    expect(row.status).toBe('running');  // left alone
  });

  it('calls publishUpdate when transitioning', async () => {
    const id = insertJob({ ageMs: 70_000 });
    caddyConfig.findAcmePolicyIndex.mockResolvedValue(0);
    const spy = jest.fn();
    acmeWatcher.setPublishUpdate(spy);
    await acmeWatcher._internals._tick();
    expect(spy).toHaveBeenCalledWith(id);
    acmeWatcher.setPublishUpdate(null);
  });
});
