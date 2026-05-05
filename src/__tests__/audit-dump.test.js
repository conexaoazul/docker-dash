'use strict';

// 📚 WHY: Audit dump is the off-site witness for compliance. The hash chain
// MUST survive the JSONL → gzip → upload → download → gunzip round-trip
// or auditors can't verify integrity later.

process.env.APP_SECRET = 'test-secret';
process.env.ENCRYPTION_KEY = 'test-encryption-key-for-jest-32chars';
process.env.DB_PATH = ':memory:';

jest.mock('../services/pcloud-backup', () => ({
  uploadAuditDump: jest.fn().mockResolvedValue(),
  pruneAuditDumps: jest.fn().mockResolvedValue({ deleted: 0 }),
  noteAuditDumpResult: jest.fn(),
  uploadStackBundle: jest.fn().mockResolvedValue(),
  pruneStackArchives: jest.fn().mockResolvedValue({ deleted: 0 }),
  noteStackArchiveResult: jest.fn(),
}));

jest.mock('../services/s3-backup', () => ({
  uploadObject: jest.fn().mockResolvedValue(),
}));

const zlib = require('zlib');
const auditDump = require('../jobs/audit-dump');
const pcloudBackup = require('../services/pcloud-backup');

// Force config.pcloud to be enabled for the tests by stubbing the getter
const config = require('../config');
Object.defineProperty(config, 'pcloud', {
  configurable: true,
  get: () => ({ enabled: true, region: 'eu', schedules: {} }),
});
Object.defineProperty(config, 's3', {
  configurable: true,
  get: () => ({ enabled: false }),
});

const { getDb } = require('../db');

function _seedAuditRows(rows) {
  const db = getDb();
  db.pragma('foreign_keys = OFF');
  // Make sure the table exists; seed entries with both hash columns
  db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    action TEXT,
    target_type TEXT,
    target_id TEXT,
    details TEXT,
    ip TEXT,
    user_agent TEXT,
    created_at TEXT,
    entry_hash TEXT,
    prev_hash TEXT
  )`);
  db.prepare('DELETE FROM audit_log').run();
  const stmt = db.prepare(`
    INSERT INTO audit_log (id, user_id, username, action, created_at, entry_hash, prev_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of rows) {
    stmt.run(r.id, r.user_id ?? 0, r.username ?? 'sys', r.action, r.created_at, r.entry_hash, r.prev_hash);
  }
}

describe('audit-dump', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('_previousMonth', () => {
    it('returns a YYYY-MM range one month before "now"', () => {
      const r = auditDump._previousMonth(new Date(Date.UTC(2026, 4, 5))); // May 5, 2026
      expect(r.yearMonth).toBe('2026-04');
      expect(r.since).toBe('2026-04-01T00:00:00.000Z');
      expect(r.until).toBe('2026-05-01T00:00:00.000Z');
    });

    it('wraps year boundary correctly', () => {
      const r = auditDump._previousMonth(new Date(Date.UTC(2026, 0, 15))); // Jan 15, 2026
      expect(r.yearMonth).toBe('2025-12');
      expect(r.since).toBe('2025-12-01T00:00:00.000Z');
    });
  });

  describe('_explicitMonth', () => {
    it('parses YYYY-MM into a UTC range', () => {
      const r = auditDump._explicitMonth('2026-03');
      expect(r.yearMonth).toBe('2026-03');
      expect(r.since).toBe('2026-03-01T00:00:00.000Z');
      expect(r.until).toBe('2026-04-01T00:00:00.000Z');
    });

    it('rejects malformed month', () => {
      expect(() => auditDump._explicitMonth('2026/03')).toThrow(/Invalid month/);
      expect(() => auditDump._explicitMonth('26-03')).toThrow(/Invalid month/);
      expect(() => auditDump._explicitMonth('2026-13')).toThrow(/Invalid month/);
    });

    it('rejects future month', () => {
      const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const ym = `${future.getUTCFullYear()}-${String(future.getUTCMonth() + 1).padStart(2, '0')}`;
      expect(() => auditDump._explicitMonth(ym)).toThrow(/future/i);
    });
  });

  describe('run({ month })', () => {
    it('exports only rows in the requested month', async () => {
      _seedAuditRows([
        { id: 1, action: 'login',  created_at: '2026-04-15T10:00:00Z', entry_hash: 'h1', prev_hash: '0' },
        { id: 2, action: 'logout', created_at: '2026-04-15T11:00:00Z', entry_hash: 'h2', prev_hash: 'h1' },
        { id: 3, action: 'login',  created_at: '2026-05-01T10:00:00Z', entry_hash: 'h3', prev_hash: 'h2' },
      ]);

      const r = await auditDump.run({ trigger: 'manual', month: '2026-04' });
      expect(r.rows).toBe(2);
      expect(pcloudBackup.uploadAuditDump).toHaveBeenCalledWith('2026-04', expect.any(Buffer));
    });

    it('preserves hash chain in the gzipped JSONL output', async () => {
      _seedAuditRows([
        { id: 1, action: 'login',  created_at: '2026-04-15T10:00:00Z', entry_hash: 'h1', prev_hash: '0' },
        { id: 2, action: 'logout', created_at: '2026-04-15T11:00:00Z', entry_hash: 'h2', prev_hash: 'h1' },
      ]);

      await auditDump.run({ month: '2026-04' });
      const [, gzBuffer] = pcloudBackup.uploadAuditDump.mock.calls[0];
      const jsonl = zlib.gunzipSync(gzBuffer).toString('utf8').trim();
      const lines = jsonl.split('\n').map(l => JSON.parse(l));
      expect(lines).toHaveLength(2);
      expect(lines[0].entry_hash).toBe('h1');
      expect(lines[1].prev_hash).toBe('h1'); // chain link intact
      expect(lines[1].entry_hash).toBe('h2');
    });

    it('produces valid gzip for empty months', async () => {
      _seedAuditRows([]);
      const r = await auditDump.run({ month: '2026-04' });
      expect(r.rows).toBe(0);
      const [, gzBuffer] = pcloudBackup.uploadAuditDump.mock.calls[0];
      const jsonl = zlib.gunzipSync(gzBuffer).toString('utf8');
      expect(jsonl).toBe(''); // 0 rows = empty body, but still valid gzip
    });

    it('records noteAuditDumpResult with status=success on success', async () => {
      _seedAuditRows([
        { id: 1, action: 'x', created_at: '2026-04-15T10:00:00Z', entry_hash: 'h1', prev_hash: '0' },
      ]);
      await auditDump.run({ month: '2026-04' });
      expect(pcloudBackup.noteAuditDumpResult).toHaveBeenCalledWith({ status: 'success', error: null });
    });

    it('records noteAuditDumpResult with error and rethrows on upload failure', async () => {
      pcloudBackup.uploadAuditDump.mockRejectedValueOnce(new Error('quota_full'));
      _seedAuditRows([
        { id: 1, action: 'x', created_at: '2026-04-15T10:00:00Z', entry_hash: 'h1', prev_hash: '0' },
      ]);
      await expect(auditDump.run({ month: '2026-04' })).rejects.toThrow(/quota_full/);
      expect(pcloudBackup.noteAuditDumpResult).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'error', error: expect.stringContaining('quota_full') })
      );
    });
  });
});
