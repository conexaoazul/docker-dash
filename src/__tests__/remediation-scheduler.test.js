'use strict';

// Tests for src/services/remediation-scheduler.js (v6.9.0).

process.env.APP_SECRET = 'test-secret-scheduler';
process.env.APP_ENV = 'test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-for-jest-32chars';
process.env.DB_PATH = ':memory:';
process.env.ADMIN_PASSWORD = 'SchedTest123!';

const { getDb } = require('../db');
getDb();

const scheduler = require('../services/remediation-scheduler');

function insertJob({ scheduledAt = null, status = 'scheduled' } = {}) {
  const res = getDb().prepare(`
    INSERT INTO remediation_jobs (mode, scope_type, scope_id, host_id, plan_json, status, scheduled_at)
    VALUES ('apply-local', 'container', ?, 0, '{"steps":[]}', ?, ?)
  `).run('c' + Math.random().toString(36).slice(2, 10), status, scheduledAt);
  return res.lastInsertRowid;
}

beforeEach(() => {
  getDb().prepare('DELETE FROM remediation_jobs').run();
  scheduler.setRunner(null);
});

describe('remediation-scheduler._tick', () => {
  it('promotes scheduled jobs whose scheduled_at <= now', async () => {
    const past = new Date(Date.now() - 60_000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
    const id = insertJob({ scheduledAt: past });

    const runner = jest.fn().mockResolvedValue();
    scheduler.setRunner(runner);

    const r = await scheduler._internals._tick();
    expect(r.promoted).toBe(1);
    expect(runner).toHaveBeenCalledWith(id);

    const row = getDb().prepare('SELECT status FROM remediation_jobs WHERE id = ?').get(id);
    expect(row.status).toBe('pending');
  });

  it('skips jobs with future scheduled_at', async () => {
    const future = new Date(Date.now() + 60 * 60_000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
    const id = insertJob({ scheduledAt: future });

    const runner = jest.fn().mockResolvedValue();
    scheduler.setRunner(runner);

    const r = await scheduler._internals._tick();
    expect(r.promoted).toBe(0);
    expect(runner).not.toHaveBeenCalled();

    const row = getDb().prepare('SELECT status FROM remediation_jobs WHERE id = ?').get(id);
    expect(row.status).toBe('scheduled');
  });

  it('ignores jobs not in status=scheduled', async () => {
    const past = new Date(Date.now() - 60_000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
    insertJob({ scheduledAt: past, status: 'pending' });
    insertJob({ scheduledAt: past, status: 'success' });

    const runner = jest.fn();
    scheduler.setRunner(runner);

    const r = await scheduler._internals._tick();
    expect(r.promoted).toBe(0);
    expect(runner).not.toHaveBeenCalled();
  });

  it('returns early when no runner is set but still promotes (fail-safe)', async () => {
    const past = new Date(Date.now() - 60_000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
    const id = insertJob({ scheduledAt: past });

    // No runner set
    const r = await scheduler._internals._tick();
    expect(r.promoted).toBe(1);

    const row = getDb().prepare('SELECT status FROM remediation_jobs WHERE id = ?').get(id);
    expect(row.status).toBe('pending');  // still promoted — admin can manually trigger
  });

  it('runner errors are logged, do not crash the tick', async () => {
    const past = new Date(Date.now() - 60_000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
    insertJob({ scheduledAt: past });

    const runner = jest.fn().mockRejectedValue(new Error('boom'));
    scheduler.setRunner(runner);

    const r = await scheduler._internals._tick();
    expect(r.promoted).toBe(1);  // promotion happened; runner failure is async/caught
  });

  it('processes jobs in scheduled_at ASC order', async () => {
    const t1 = new Date(Date.now() - 120_000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
    const t2 = new Date(Date.now() - 60_000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
    const b = insertJob({ scheduledAt: t2 });
    const a = insertJob({ scheduledAt: t1 });

    const order = [];
    const runner = jest.fn().mockImplementation((id) => { order.push(id); return Promise.resolve(); });
    scheduler.setRunner(runner);

    await scheduler._internals._tick();
    expect(order).toEqual([a, b]);  // older scheduled_at first
  });
});
