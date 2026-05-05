'use strict';

// WHY: Post-v8.2.0 audit log gap-closure test suite.
//
// `audit-integrity.test.js` already exercises the hash-chain invariants
// (chain linkage, tamper detection, basic export shapes). It does NOT
// cover the rest of the surface area on the immutable audit-log critical
// path — query() filters/pagination, CSV escaping edge cases, RFC 5424
// syslog priority, the new exportJsonl() streaming added in v8.2.0,
// cleanup retention math, and the security-alerting onLog hook payload.
//
// Those gaps matter because:
//   - exportJsonl() is the witness path uploaded off-site monthly; if it
//     drops or reorders rows, auditors lose verifiability.
//   - CSV escaping bugs corrupt SIEM ingestion silently.
//   - cleanup() is the only mutation we ever do on audit_log; a
//     regression here either retains too much (PII risk) or too little
//     (compliance gap).
//
// This file plugs those gaps without duplicating chain-integrity tests.

process.env.APP_SECRET = 'test-secret-key-for-jest-tests-only';
process.env.ENCRYPTION_KEY = 'test-encryption-key-for-jest-32chars';
process.env.DB_PATH = ':memory:';

const { Writable } = require('stream');

describe('AuditService — gap closure (post-v8.2.0)', () => {
  let db, auditService, config;

  beforeAll(() => {
    const { getDb } = require('../db');
    db = getDb();
    // FK is ON by default; tests log with synthetic user_id values that
    // don't have backing user rows, so disable FK enforcement here.
    db.pragma('foreign_keys = OFF');
    auditService = require('../services/audit');
    config = require('../config');
  });

  afterAll(() => {
    const { closeDb } = require('../db');
    closeDb();
  });

  beforeEach(() => {
    // Each test owns its own data window — clear between tests so
    // pagination/filter assertions are deterministic.
    db.prepare('DELETE FROM audit_log').run();
    auditService.onLog(null);
  });

  // ── log() persistence ──────────────────────────────────────────────

  it('persists row with all expected fields', () => {
    auditService.log({
      userId: 42,
      username: 'alice',
      action: 'container.start',
      targetType: 'container',
      targetId: 'abc123',
      details: { image: 'nginx:latest', force: false },
      ip: '10.0.0.5',
      userAgent: 'curl/8.4',
    });

    const row = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 1').get();
    expect(row.user_id).toBe(42);
    expect(row.username).toBe('alice');
    expect(row.action).toBe('container.start');
    expect(row.target_type).toBe('container');
    expect(row.target_id).toBe('abc123');
    expect(row.ip).toBe('10.0.0.5');
    expect(row.user_agent).toBe('curl/8.4');
    // details is JSON-serialized for object inputs
    const parsed = JSON.parse(row.details);
    expect(parsed.image).toBe('nginx:latest');
    expect(parsed.force).toBe(false);
  });

  it('inserts genesis prev_hash (64 zeros) for the first row', () => {
    auditService.log({ username: 'sys', action: 'first.entry', ip: '127.0.0.1' });
    const row = db.prepare('SELECT * FROM audit_log ORDER BY id ASC LIMIT 1').get();
    expect(row.prev_hash).toBe('0'.repeat(64));
    expect(row.entry_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('chains prev_hash of row N+1 to entry_hash of row N', () => {
    auditService.log({ username: 'sys', action: 'a', ip: '127.0.0.1' });
    auditService.log({ username: 'sys', action: 'b', ip: '127.0.0.1' });
    auditService.log({ username: 'sys', action: 'c', ip: '127.0.0.1' });

    const rows = db.prepare('SELECT * FROM audit_log ORDER BY id ASC').all();
    expect(rows.length).toBe(3);
    expect(rows[1].prev_hash).toBe(rows[0].entry_hash);
    expect(rows[2].prev_hash).toBe(rows[1].entry_hash);
    // Each entry hash is unique (no collision on close-by writes)
    const hashes = new Set(rows.map(r => r.entry_hash));
    expect(hashes.size).toBe(3);
  });

  // ── query() filters & pagination ───────────────────────────────────

  it('query() filters by exact action match', () => {
    auditService.log({ username: 'u', action: 'login', ip: '1.1.1.1' });
    auditService.log({ username: 'u', action: 'logout', ip: '1.1.1.1' });
    auditService.log({ username: 'u', action: 'login', ip: '1.1.1.1' });

    const result = auditService.query({ action: 'login' });
    expect(result.total).toBe(2);
    expect(result.rows.every(r => r.action === 'login')).toBe(true);
  });

  it('query() filters by date range using since/until', () => {
    // Insert rows with explicit created_at so we can assert range filtering
    const insert = db.prepare(`
      INSERT INTO audit_log (action, username, created_at, entry_hash, prev_hash)
      VALUES (?, ?, ?, ?, ?)
    `);
    insert.run('range.old',  'u', '2026-01-01T00:00:00Z', 'h1', '0'.repeat(64));
    insert.run('range.mid',  'u', '2026-03-15T12:00:00Z', 'h2', 'h1');
    insert.run('range.new',  'u', '2026-05-30T23:00:00Z', 'h3', 'h2');

    const result = auditService.query({
      since: '2026-02-01T00:00:00Z',
      until: '2026-04-30T23:59:59Z',
    });
    expect(result.total).toBe(1);
    expect(result.rows[0].action).toBe('range.mid');
  });

  it('query() filters by user_id', () => {
    auditService.log({ userId: 100, username: 'a', action: 'x', ip: '1.1.1.1' });
    auditService.log({ userId: 200, username: 'b', action: 'x', ip: '1.1.1.1' });
    auditService.log({ userId: 100, username: 'a', action: 'x', ip: '1.1.1.1' });

    const result = auditService.query({ userId: 100 });
    expect(result.total).toBe(2);
    expect(result.rows.every(r => r.user_id === 100)).toBe(true);
  });

  it('query() paginates with limit + offset (page parameter)', () => {
    // Create 12 entries so we can paginate
    for (let i = 0; i < 12; i++) {
      auditService.log({ username: 'u', action: `pg.${i}`, ip: '127.0.0.1' });
    }

    const page1 = auditService.query({ page: 1, limit: 5 });
    const page2 = auditService.query({ page: 2, limit: 5 });
    const page3 = auditService.query({ page: 3, limit: 5 });

    expect(page1.total).toBe(12);
    expect(page1.rows.length).toBe(5);
    expect(page2.rows.length).toBe(5);
    expect(page3.rows.length).toBe(2); // remainder
    expect(page1.pages).toBe(3);

    // No row appears on more than one page
    const ids = [
      ...page1.rows.map(r => r.id),
      ...page2.rows.map(r => r.id),
      ...page3.rows.map(r => r.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  // ── export() formats ───────────────────────────────────────────────

  it('export("json") returns a parseable JSON array', () => {
    auditService.log({ username: 'u', action: 'json.test', ip: '127.0.0.1' });
    auditService.log({ username: 'u', action: 'json.test2', ip: '127.0.0.1' });

    const out = auditService.export('json');
    const parsed = JSON.parse(out);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);
    expect(parsed[0]).toHaveProperty('entry_hash');
    expect(parsed[0]).toHaveProperty('prev_hash');
  });

  it('export("csv") escapes commas, newlines and embedded quotes correctly', () => {
    // Seed a single row with adversarial content via direct insert so we
    // control exact characters going through _toCsv().
    db.prepare(`
      INSERT INTO audit_log (action, username, details, ip, created_at, entry_hash, prev_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'csv.test',
      'alice',
      'value, with "quotes" and\nnewline',
      '127.0.0.1',
      '2026-04-01T00:00:00Z',
      'h1',
      '0'.repeat(64)
    );

    const csv = auditService.export('csv');
    const headerLine = csv.split('\n')[0];
    expect(headerLine).toBe(
      'id,user_id,username,action,target_type,target_id,details,ip,user_agent,created_at,entry_hash,prev_hash'
    );

    // The whole field must be wrapped in quotes and inner quotes doubled.
    expect(csv).toContain('"value, with ""quotes"" and\nnewline"');
    // Plain field (no special chars) must NOT be wrapped.
    expect(csv).toMatch(/,alice,/);
  });

  it('export("syslog") emits RFC 5424 priority + structured-data', () => {
    auditService.log({
      userId: 7,
      username: 'sys',
      action: 'syslog.test',
      targetType: 'host',
      targetId: 'h1',
      ip: '10.0.0.1',
    });

    const out = auditService.export('syslog');
    // Priority for facility=10 (security/auth) * 8 + severity=6 (info) = 86
    expect(out).toMatch(/^<86>1 /);
    // Version "1" + ISO timestamp + app-name "docker-dash"
    expect(out).toContain(' docker-dash ');
    // Structured-data block per RFC 5424 §6.3 with our SD-ID "audit@0"
    expect(out).toContain('[audit@0 ');
    expect(out).toContain('action="syslog.test"');
    expect(out).toContain('username="sys"');
  });

  // ── exportJsonl() streaming (v8.2.0) ───────────────────────────────

  it('exportJsonl streams one row per line via stmt.iterate', () => {
    const insert = db.prepare(`
      INSERT INTO audit_log (action, username, created_at, entry_hash, prev_hash)
      VALUES (?, ?, ?, ?, ?)
    `);
    insert.run('a', 'u', '2026-04-01T10:00:00Z', 'h1', '0'.repeat(64));
    insert.run('b', 'u', '2026-04-15T10:00:00Z', 'h2', 'h1');
    insert.run('c', 'u', '2026-04-29T23:59:59Z', 'h3', 'h2');
    // Out-of-window row — must NOT appear in stream output.
    insert.run('z', 'u', '2026-05-02T00:00:00Z', 'h4', 'h3');

    const chunks = [];
    const out = new Writable({
      write(chunk, _enc, cb) { chunks.push(chunk.toString('utf8')); cb(); },
    });

    const result = auditService.exportJsonl({
      since: '2026-04-01T00:00:00Z',
      until: '2026-05-01T00:00:00Z',
      out,
    });

    expect(result.count).toBe(3);
    const text = chunks.join('');
    const lines = text.trimEnd().split('\n');
    expect(lines.length).toBe(3);
    // Each line must be standalone valid JSON (newline-delimited).
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('exportJsonl preserves entry_hash + prev_hash row-for-row (round trip)', () => {
    // Generate real chain entries via the service so hashes are computed
    // canonically — then read them back through the stream.
    auditService.log({ username: 'sys', action: 'jsonl.a', ip: '127.0.0.1' });
    auditService.log({ username: 'sys', action: 'jsonl.b', ip: '127.0.0.1' });
    auditService.log({ username: 'sys', action: 'jsonl.c', ip: '127.0.0.1' });

    const dbRows = db.prepare('SELECT * FROM audit_log ORDER BY id ASC').all();
    expect(dbRows.length).toBe(3);

    const captured = [];
    const out = new Writable({
      write(chunk, _enc, cb) { captured.push(chunk.toString('utf8')); cb(); },
    });

    // Wide window to capture everything regardless of test clock.
    auditService.exportJsonl({
      since: '1970-01-01T00:00:00Z',
      until: '2999-12-31T23:59:59Z',
      out,
    });

    const lines = captured.join('').trimEnd().split('\n').map(JSON.parse);
    expect(lines.length).toBe(3);
    for (let i = 0; i < lines.length; i++) {
      expect(lines[i].entry_hash).toBe(dbRows[i].entry_hash);
      expect(lines[i].prev_hash).toBe(dbRows[i].prev_hash);
      expect(lines[i].action).toBe(dbRows[i].action);
    }
    // Chain link still verifiable from streamed payload alone.
    expect(lines[1].prev_hash).toBe(lines[0].entry_hash);
    expect(lines[2].prev_hash).toBe(lines[1].entry_hash);
  });

  // ── cleanup() retention ────────────────────────────────────────────

  it('cleanup(days) deletes only rows older than N days', () => {
    // Insert one row 100 days old, one row 5 days old.
    const insert = db.prepare(`
      INSERT INTO audit_log (action, username, created_at, entry_hash, prev_hash)
      VALUES (?, ?, datetime('now', ?), ?, ?)
    `);
    insert.run('old', 'u', '-100 days', 'h1', '0'.repeat(64));
    insert.run('new', 'u', '-5 days',   'h2', 'h1');

    // Make sure strict mode is OFF for this test.
    const original = config.security.isStrict;
    config.security.isStrict = false;

    const deleted = auditService.cleanup(30);
    expect(deleted).toBe(1);

    const remaining = db.prepare('SELECT action FROM audit_log ORDER BY id ASC').all();
    expect(remaining.length).toBe(1);
    expect(remaining[0].action).toBe('new');

    config.security.isStrict = original;
  });

  it('cleanup() is BLOCKED in strict security mode (returns 0, keeps rows)', () => {
    auditService.log({ username: 'u', action: 'must.survive', ip: '127.0.0.1' });

    const original = config.security.isStrict;
    config.security.isStrict = true;
    try {
      // Even days=0 (delete everything) must be a no-op in strict mode.
      const deleted = auditService.cleanup(0);
      expect(deleted).toBe(0);

      const stillThere = db.prepare(
        "SELECT COUNT(*) AS c FROM audit_log WHERE action = 'must.survive'"
      ).get().c;
      expect(stillThere).toBe(1);
    } finally {
      config.security.isStrict = original;
    }
  });

  // ── onLog() security alerting hook ─────────────────────────────────

  it('onLog callback fires after each successful log() with the inserted entry', () => {
    const captured = [];
    auditService.onLog((entry) => captured.push(entry));

    auditService.log({
      userId: 9,
      username: 'hooked',
      action: 'hook.fire',
      targetType: 'image',
      targetId: 'img:1',
      details: { foo: 'bar' },
      ip: '10.0.0.99',
      userAgent: 'jest',
    });

    expect(captured.length).toBe(1);
    const entry = captured[0];
    expect(entry.userId).toBe(9);
    expect(entry.username).toBe('hooked');
    expect(entry.action).toBe('hook.fire');
    expect(entry.targetType).toBe('image');
    expect(entry.targetId).toBe('img:1');
    expect(entry.ip).toBe('10.0.0.99');
    expect(entry.userAgent).toBe('jest');
    // Details are passed as the serialized string (matches what was persisted).
    expect(entry.details).toBe(JSON.stringify({ foo: 'bar' }));
    expect(typeof entry.createdAt).toBe('string');
    expect(entry.createdAt.length).toBeGreaterThan(0);
  });
});
