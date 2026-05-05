'use strict';

// pCloud backup orchestration. Owns the single-row pcloud_config table and
// orchestrates DB / stack / audit uploads via pcloud-client. Tokens stored
// AES-256-GCM encrypted (existing crypto util). Username/password are NEVER
// persisted — only the long-lived auth token derived from them.

const fs = require('fs');
const path = require('path');
const pcloud = require('./pcloud-client');
const { getDb } = require('../db');
const { encrypt, decrypt } = require('../utils/crypto');
const log = require('../utils/logger')('pcloud-backup');
const config = require('../config');

const QUOTA_SAFETY_MARGIN_BYTES = 50 * 1024 * 1024; // 50 MB headroom
const QUOTA_HARD_PCT = 95;
const SERVER_PRUNE_CAP = 50;

let _uploadInFlight = false;

// ─── Config row helpers ───────────────────────────────────

function _row() {
  return getDb().prepare('SELECT * FROM pcloud_config WHERE id=1').get();
}

function _saveConfig(patch) {
  const cols = Object.keys(patch);
  if (cols.length === 0) return;
  const setSql = cols.map(c => `${c} = ?`).join(', ');
  const vals = cols.map(c => patch[c]);
  getDb().prepare(`UPDATE pcloud_config SET ${setSql}, updated_at = CURRENT_TIMESTAMP WHERE id=1`).run(...vals);
  if (typeof config.invalidatePcloudCache === 'function') config.invalidatePcloudCache();
}

function _decryptedToken(row) {
  if (!row?.auth_token_encrypted) return null;
  try { return decrypt(row.auth_token_encrypted); }
  catch (err) { log.error('Failed to decrypt pCloud token', err.message); return null; }
}

// ─── Connection lifecycle ─────────────────────────────────

async function connect({ username, password, region = 'eu' }) {
  if (!username || !password) throw new Error('username and password required');
  if (!['eu', 'us'].includes(region)) throw new Error('region must be eu or us');

  const r = await pcloud.obtainAuthToken({ username, password, region });
  if (!r.auth) throw new Error('pCloud did not return an auth token');

  _saveConfig({
    enabled: 1,
    region,
    auth_token_encrypted: encrypt(r.auth),
    account_email: r.email || null,
    quota_total: r.quota || null,
    quota_used: r.usedquota || null,
    quota_checked_at: new Date().toISOString(),
  });

  return { ok: true, email: r.email, region, quota: r.quota, usedquota: r.usedquota };
}

async function disconnect() {
  const row = _row();
  const token = _decryptedToken(row);
  if (token) {
    try { await pcloud.logout({ token, region: row.region }); }
    catch (err) { log.warn('pCloud logout failed (clearing local token anyway)', err.message); }
  }
  _saveConfig({
    enabled: 0,
    auth_token_encrypted: null,
    account_email: null,
    quota_total: null,
    quota_used: null,
    quota_checked_at: null,
  });
  return { ok: true };
}

async function testConnection() {
  const row = _row();
  const token = _decryptedToken(row);
  if (!token) throw new Error('pCloud not connected');
  const info = await pcloud.userInfo({ token, region: row.region });
  _saveConfig({
    quota_total: info.quota || null,
    quota_used: info.usedquota || null,
    quota_checked_at: new Date().toISOString(),
  });
  return { ok: true, email: info.email, quota: info.quota, usedquota: info.usedquota };
}

function getStatus() {
  const row = _row();
  if (!row) return { enabled: false, configured: false };

  const quotaPct = row.quota_total ? (row.quota_used / row.quota_total) * 100 : null;
  return {
    enabled: !!row.enabled,
    configured: !!row.auth_token_encrypted,
    region: row.region,
    email: row.account_email,
    baseFolder: row.base_folder,
    quota: {
      total: row.quota_total,
      used: row.quota_used,
      pct: quotaPct,
      checkedAt: row.quota_checked_at,
    },
    schedules: {
      db: row.db_schedule,
      stack: row.stack_schedule,
      audit: row.audit_schedule,
    },
    keep: {
      db: row.keep_db,
      stackWeeks: row.keep_stack_weeks,
      auditMonths: row.keep_audit_months,
    },
    lastBackup: {
      db: { at: row.last_db_at, status: row.last_db_status, error: row.last_db_error },
      stack: { at: row.last_stack_at, status: row.last_stack_status, error: row.last_stack_error },
      audit: { at: row.last_audit_at, status: row.last_audit_status, error: row.last_audit_error },
    },
  };
}

function updateConfig({ schedules = {}, keep = {}, baseFolder } = {}) {
  const patch = {};
  if (schedules.db !== undefined) patch.db_schedule = schedules.db || '0 3 * * *';
  if (schedules.stack !== undefined) patch.stack_schedule = schedules.stack || '0 4 * * 0';
  if (schedules.audit !== undefined) patch.audit_schedule = schedules.audit || '5 4 1 * *';
  if (keep.db !== undefined) patch.keep_db = Math.max(1, parseInt(keep.db, 10) || 7);
  if (keep.stackWeeks !== undefined) patch.keep_stack_weeks = Math.max(1, parseInt(keep.stackWeeks, 10) || 8);
  if (keep.auditMonths !== undefined) patch.keep_audit_months = Math.max(1, parseInt(keep.auditMonths, 10) || 24);
  if (baseFolder !== undefined && /^\/[\w./-]+$/.test(baseFolder)) patch.base_folder = baseFolder;
  _saveConfig(patch);
  return getStatus();
}

// ─── Quota check ──────────────────────────────────────────

function _checkQuota(row, uploadBytes) {
  if (!row.quota_total) return; // unknown quota — let the upload try
  const projected = (row.quota_used || 0) + uploadBytes;
  const pct = (projected / row.quota_total) * 100;
  if (pct >= QUOTA_HARD_PCT) {
    throw new Error(`pCloud quota near full (${pct.toFixed(1)}% after upload). Free space or upgrade.`);
  }
  if (projected + QUOTA_SAFETY_MARGIN_BYTES > row.quota_total) {
    throw new Error('pCloud quota would not leave 50 MB safety margin after upload.');
  }
}

// ─── Backup operations ────────────────────────────────────

function _findLatestDbBackup() {
  const backupDir = path.join(process.env.DATA_DIR || '/data', 'backups');
  if (!fs.existsSync(backupDir)) return null;
  const candidates = fs.readdirSync(backupDir)
    .filter(f => f.startsWith('backup-daily-') && (f.endsWith('.db') || f.endsWith('.db.enc')))
    .map(f => ({ f, mtime: fs.statSync(path.join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (candidates.length === 0) return null;
  return path.join(backupDir, candidates[0].f);
}

async function uploadDbBackup({ trigger = 'cron' } = {}) {
  if (_uploadInFlight) throw new Error('A pCloud upload is already in progress');
  _uploadInFlight = true;
  const startedAt = Date.now();

  try {
    const row = _row();
    const token = _decryptedToken(row);
    if (!row?.enabled || !token) throw new Error('pCloud not enabled or not connected');

    const filePath = _findLatestDbBackup();
    if (!filePath) throw new Error('No local DB backup found (run daily-backup first)');

    const body = fs.readFileSync(filePath);
    _checkQuota(row, body.length);

    const folder = `${row.base_folder}/db`;
    await pcloud.ensureFolder({ token, region: row.region, path: folder });
    await pcloud.uploadFile({
      token, region: row.region, folder,
      name: path.basename(filePath),
      body,
      contentType: 'application/octet-stream',
    });

    const completedAt = new Date().toISOString();
    _saveConfig({
      last_db_at: completedAt,
      last_db_status: 'success',
      last_db_error: null,
    });

    // Refresh quota async (best effort)
    pcloud.userInfo({ token, region: row.region })
      .then(info => _saveConfig({
        quota_total: info.quota || null,
        quota_used: info.usedquota || null,
        quota_checked_at: new Date().toISOString(),
      }))
      .catch(() => { /* ignore */ });

    // Prune old DB backups in pCloud
    pruneOldFiles('db', row.keep_db).catch(err => log.warn('DB prune failed', err.message));

    const durationMs = Date.now() - startedAt;
    require('./audit').log({
      userId: 0, username: 'system',
      action: 'backup_pcloud', targetType: 'system', targetId: 'db',
      details: JSON.stringify({ kind: 'db', trigger, file: path.basename(filePath), size: body.length, durationMs }),
    });

    return { ok: true, file: path.basename(filePath), size: body.length, durationMs };
  } catch (err) {
    _saveConfig({
      last_db_at: new Date().toISOString(),
      last_db_status: 'error',
      last_db_error: String(err.message || err).substring(0, 500),
    });
    require('./audit').log({
      userId: 0, username: 'system',
      action: 'backup_pcloud_failed', targetType: 'system', targetId: 'db',
      details: JSON.stringify({ kind: 'db', trigger, error: String(err.message || err) }),
    });
    throw err;
  } finally {
    _uploadInFlight = false;
  }
}

async function uploadStackBundle(folder, fileName, body) {
  const row = _row();
  const token = _decryptedToken(row);
  if (!row?.enabled || !token) throw new Error('pCloud not enabled or not connected');
  if (!Buffer.isBuffer(body)) body = Buffer.from(body);
  _checkQuota(row, body.length);

  await pcloud.ensureFolder({ token, region: row.region, path: folder });
  await pcloud.uploadFile({
    token, region: row.region, folder,
    name: fileName, body,
    contentType: 'application/json',
  });
}

function noteStackArchiveResult({ status, error }) {
  _saveConfig({
    last_stack_at: new Date().toISOString(),
    last_stack_status: status,
    last_stack_error: error ? String(error).substring(0, 500) : null,
  });
}

async function uploadAuditDump(yearMonth, gzBuffer) {
  const row = _row();
  const token = _decryptedToken(row);
  if (!row?.enabled || !token) throw new Error('pCloud not enabled or not connected');
  if (!Buffer.isBuffer(gzBuffer)) gzBuffer = Buffer.from(gzBuffer);
  _checkQuota(row, gzBuffer.length);

  const folder = `${row.base_folder}/audit`;
  await pcloud.ensureFolder({ token, region: row.region, path: folder });
  await pcloud.uploadFile({
    token, region: row.region, folder,
    name: `${yearMonth}.jsonl.gz`,
    body: gzBuffer,
    contentType: 'application/gzip',
  });
}

function noteAuditDumpResult({ status, error }) {
  _saveConfig({
    last_audit_at: new Date().toISOString(),
    last_audit_status: status,
    last_audit_error: error ? String(error).substring(0, 500) : null,
  });
}

// ─── Retention prune ──────────────────────────────────────

async function pruneOldFiles(kind, keepN) {
  const row = _row();
  const token = _decryptedToken(row);
  if (!token) return { deleted: 0 };

  const folderMap = { db: '/db', audit: '/audit' };
  if (!folderMap[kind]) throw new Error(`Unknown prune kind: ${kind}`);

  const folder = `${row.base_folder}${folderMap[kind]}`;
  let listing;
  try { listing = await pcloud.listFolder({ token, region: row.region, path: folder }); }
  catch (err) { log.warn(`prune listFolder failed for ${folder}`, err.message); return { deleted: 0 }; }

  const files = (listing.metadata?.contents || [])
    .filter(e => !e.isfolder)
    .sort((a, b) => new Date(b.modified) - new Date(a.modified));

  const toDelete = files.slice(keepN, keepN + SERVER_PRUNE_CAP);
  const deleted = [];
  for (const f of toDelete) {
    try {
      await pcloud.deleteFile({ token, region: row.region, path: `${folder}/${f.name}` });
      deleted.push(f.name);
    } catch (err) {
      log.warn(`Failed to delete ${f.name}`, err.message);
    }
  }

  if (deleted.length > 0) {
    require('./audit').log({
      userId: 0, username: 'system',
      action: 'pcloud_prune', targetType: 'system', targetId: kind,
      details: JSON.stringify({ kind, deleted, kept: keepN }),
    });
  }
  return { deleted: deleted.length, files: deleted };
}

async function pruneStackArchives() {
  const row = _row();
  const token = _decryptedToken(row);
  if (!token) return { deleted: 0 };

  const root = `${row.base_folder}/stacks`;
  let listing;
  try { listing = await pcloud.listFolder({ token, region: row.region, path: root }); }
  catch (err) { log.warn('stacks listFolder failed', err.message); return { deleted: 0 }; }

  const dateFolders = (listing.metadata?.contents || [])
    .filter(e => e.isfolder && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
    .sort((a, b) => b.name.localeCompare(a.name));

  const keepWeeks = row.keep_stack_weeks || 8;
  const toDelete = dateFolders.slice(keepWeeks, keepWeeks + SERVER_PRUNE_CAP);
  const deleted = [];
  for (const dir of toDelete) {
    const fullPath = `${root}/${dir.name}`;
    try {
      const sub = await pcloud.listFolder({ token, region: row.region, path: fullPath });
      for (const f of (sub.metadata?.contents || []).filter(e => !e.isfolder)) {
        await pcloud.deleteFile({ token, region: row.region, path: `${fullPath}/${f.name}` });
      }
      await pcloud.deleteFolder({ token, region: row.region, path: fullPath });
      deleted.push(dir.name);
    } catch (err) {
      log.warn(`Failed to prune stacks folder ${dir.name}`, err.message);
    }
  }

  if (deleted.length > 0) {
    require('./audit').log({
      userId: 0, username: 'system',
      action: 'pcloud_prune', targetType: 'system', targetId: 'stack',
      details: JSON.stringify({ kind: 'stack', deleted, keptWeeks: keepWeeks }),
    });
  }
  return { deleted: deleted.length, folders: deleted };
}

async function pruneAuditDumps() {
  const row = _row();
  return pruneOldFiles('audit', row.keep_audit_months || 24);
}

module.exports = {
  connect,
  disconnect,
  testConnection,
  getStatus,
  updateConfig,
  uploadDbBackup,
  uploadStackBundle,
  uploadAuditDump,
  noteStackArchiveResult,
  noteAuditDumpResult,
  pruneOldFiles,
  pruneStackArchives,
  pruneAuditDumps,
};
