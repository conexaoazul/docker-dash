'use strict';

// 📚 WHY: pcloud-backup is the orchestration shell — it owns the config row,
// the quota gate, and the per-kind audit trail. Bugs here either silently
// corrupt off-site backups or leak quota.

process.env.APP_SECRET = 'test-secret';
process.env.ENCRYPTION_KEY = 'test-encryption-key-for-jest-32chars';
process.env.DB_PATH = ':memory:';

jest.mock('../services/pcloud-client', () => ({
  REGIONS: { eu: 'eapi.pcloud.com', us: 'api.pcloud.com' },
  obtainAuthToken: jest.fn(),
  userInfo: jest.fn(),
  ensureFolder: jest.fn().mockResolvedValue({ result: 0 }),
  uploadFile: jest.fn().mockResolvedValue({ result: 0 }),
  listFolder: jest.fn(),
  deleteFile: jest.fn().mockResolvedValue({ result: 0 }),
  deleteFolder: jest.fn().mockResolvedValue({ result: 0 }),
  logout: jest.fn().mockResolvedValue({ result: 0 }),
}));

jest.mock('../services/audit', () => ({
  log: jest.fn(),
}));

const fs = require('fs');
const path = require('path');
const pcloudClient = require('../services/pcloud-client');

const { getDb } = require('../db');

function _ensurePcloudTable() {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS pcloud_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 0,
    region TEXT NOT NULL DEFAULT 'eu',
    auth_token_encrypted TEXT,
    account_email TEXT,
    base_folder TEXT NOT NULL DEFAULT '/docker-dash',
    db_schedule TEXT NOT NULL DEFAULT '0 3 * * *',
    stack_schedule TEXT NOT NULL DEFAULT '0 4 * * 0',
    audit_schedule TEXT NOT NULL DEFAULT '5 4 1 * *',
    keep_db INTEGER NOT NULL DEFAULT 7,
    keep_stack_weeks INTEGER NOT NULL DEFAULT 8,
    keep_audit_months INTEGER NOT NULL DEFAULT 24,
    last_db_at TEXT, last_db_status TEXT, last_db_error TEXT,
    last_stack_at TEXT, last_stack_status TEXT, last_stack_error TEXT,
    last_audit_at TEXT, last_audit_status TEXT, last_audit_error TEXT,
    quota_total INTEGER, quota_used INTEGER, quota_checked_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.prepare('DELETE FROM pcloud_config').run();
  db.prepare('INSERT INTO pcloud_config (id) VALUES (1)').run();
}

const pcloudBackup = require('../services/pcloud-backup');

describe('pcloud-backup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _ensurePcloudTable();
  });

  describe('connect', () => {
    it('saves an encrypted token + email + region on success', async () => {
      pcloudClient.obtainAuthToken.mockResolvedValue({
        auth: 'tok-abc', userid: 1, email: 'a@b', quota: 10e9, usedquota: 1e9,
      });
      const r = await pcloudBackup.connect({ username: 'u', password: 'p', region: 'eu' });
      expect(r.ok).toBe(true);
      const status = pcloudBackup.getStatus();
      expect(status.enabled).toBe(true);
      expect(status.region).toBe('eu');
      expect(status.email).toBe('a@b');
    });

    it('rejects invalid region', async () => {
      await expect(
        pcloudBackup.connect({ username: 'u', password: 'p', region: 'asia' })
      ).rejects.toThrow(/region/);
    });

    it('rejects when client returns no token', async () => {
      pcloudClient.obtainAuthToken.mockResolvedValue({ auth: null });
      await expect(
        pcloudBackup.connect({ username: 'u', password: 'p' })
      ).rejects.toThrow(/auth token/);
    });
  });

  describe('disconnect', () => {
    it('clears the encrypted token and disables', async () => {
      pcloudClient.obtainAuthToken.mockResolvedValue({ auth: 'tok-x', email: 'a@b', quota: 10, usedquota: 1 });
      await pcloudBackup.connect({ username: 'u', password: 'p' });

      await pcloudBackup.disconnect();
      expect(pcloudClient.logout).toHaveBeenCalled();
      const status = pcloudBackup.getStatus();
      expect(status.enabled).toBe(false);
      expect(status.email).toBe(null);
    });
  });

  describe('uploadDbBackup', () => {
    let tmpBackupDir;

    beforeEach(async () => {
      pcloudClient.obtainAuthToken.mockResolvedValue({
        auth: 'tok-abc', userid: 1, email: 'a@b', quota: 10 * 1024 * 1024 * 1024, usedquota: 1024 * 1024,
      });
      pcloudClient.userInfo.mockResolvedValue({ email: 'a@b', quota: 10e9, usedquota: 1e6 });
      await pcloudBackup.connect({ username: 'u', password: 'p' });

      // Set up a fake DATA_DIR with one backup file
      tmpBackupDir = path.join(require('os').tmpdir(), `dd-pcloud-test-${Date.now()}`);
      fs.mkdirSync(path.join(tmpBackupDir, 'backups'), { recursive: true });
      fs.writeFileSync(path.join(tmpBackupDir, 'backups', 'backup-daily-2026-05-04.db'), Buffer.from('fakebackup'));
      process.env.DATA_DIR = tmpBackupDir;
    });

    afterEach(() => {
      try { fs.rmSync(tmpBackupDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    it('uploads the latest backup file via the client', async () => {
      const r = await pcloudBackup.uploadDbBackup({ trigger: 'manual' });
      expect(r.ok).toBe(true);
      expect(r.file).toBe('backup-daily-2026-05-04.db');
      expect(pcloudClient.uploadFile).toHaveBeenCalledWith(expect.objectContaining({
        folder: '/docker-dash/db',
        name: 'backup-daily-2026-05-04.db',
        body: expect.any(Buffer),
      }));
    });

    it('records last_db_status=success', async () => {
      await pcloudBackup.uploadDbBackup({ trigger: 'manual' });
      const status = pcloudBackup.getStatus();
      expect(status.lastBackup.db.status).toBe('success');
      expect(status.lastBackup.db.error).toBe(null);
    });

    it('aborts when quota would exceed 95%', async () => {
      // Set quota to make even a tiny upload trip the threshold
      const db = getDb();
      db.prepare('UPDATE pcloud_config SET quota_total=100, quota_used=99 WHERE id=1').run();

      await expect(
        pcloudBackup.uploadDbBackup({ trigger: 'manual' })
      ).rejects.toThrow(/quota/);
      const status = pcloudBackup.getStatus();
      expect(status.lastBackup.db.status).toBe('error');
    });

    it('throws when no local backup file exists', async () => {
      fs.rmSync(path.join(tmpBackupDir, 'backups'), { recursive: true });
      await expect(
        pcloudBackup.uploadDbBackup({ trigger: 'manual' })
      ).rejects.toThrow(/No local DB backup/);
    });
  });

  describe('updateConfig', () => {
    beforeEach(async () => {
      pcloudClient.obtainAuthToken.mockResolvedValue({ auth: 'tok-x', email: 'a@b', quota: 10, usedquota: 1 });
      await pcloudBackup.connect({ username: 'u', password: 'p' });
    });

    it('updates schedules', () => {
      pcloudBackup.updateConfig({ schedules: { db: '0 5 * * *' } });
      expect(pcloudBackup.getStatus().schedules.db).toBe('0 5 * * *');
    });

    it('clamps keep values to >= 1', () => {
      pcloudBackup.updateConfig({ keep: { db: -5 } });
      expect(pcloudBackup.getStatus().keep.db).toBe(1);
    });

    it('rejects invalid baseFolder', () => {
      pcloudBackup.updateConfig({ baseFolder: '../../etc' });
      expect(pcloudBackup.getStatus().baseFolder).toBe('/docker-dash'); // unchanged
    });
  });

  describe('pruneOldFiles', () => {
    beforeEach(async () => {
      pcloudClient.obtainAuthToken.mockResolvedValue({ auth: 'tok-x', email: 'a@b', quota: 10, usedquota: 1 });
      await pcloudBackup.connect({ username: 'u', password: 'p' });
    });

    it('deletes only files beyond keepN, sorted by modified desc', async () => {
      pcloudClient.listFolder.mockResolvedValue({
        metadata: {
          contents: [
            { name: 'a.db', isfolder: false, modified: '2026-05-01T00:00:00Z' },
            { name: 'b.db', isfolder: false, modified: '2026-05-02T00:00:00Z' },
            { name: 'c.db', isfolder: false, modified: '2026-05-03T00:00:00Z' },
            { name: 'd.db', isfolder: false, modified: '2026-05-04T00:00:00Z' },
            { name: 'e.db', isfolder: false, modified: '2026-05-05T00:00:00Z' },
          ],
        },
      });

      const r = await pcloudBackup.pruneOldFiles('db', 3);
      expect(r.deleted).toBe(2);
      // Files deleted should be the 2 oldest (a, b). Order independent.
      const deletedPaths = pcloudClient.deleteFile.mock.calls.map(c => c[0].path);
      expect(deletedPaths).toEqual(expect.arrayContaining(['/docker-dash/db/a.db', '/docker-dash/db/b.db']));
    });

    it('returns 0 when listFolder errors', async () => {
      pcloudClient.listFolder.mockRejectedValue(new Error('not found'));
      const r = await pcloudBackup.pruneOldFiles('db', 3);
      expect(r.deleted).toBe(0);
    });

    it('rejects unknown kind', async () => {
      await expect(pcloudBackup.pruneOldFiles('cats', 3)).rejects.toThrow(/Unknown prune kind/);
    });
  });
});
