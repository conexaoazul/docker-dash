'use strict';

const { getDb } = require('../db');
const https = require('https');
const http = require('http');
const config = require('../config');
const log = require('../utils/logger')('registry');
const { encrypt, decrypt } = require('../utils/crypto');

class RegistryService {
  constructor() {
    // Migrate legacy XOR-encrypted passwords to AES-GCM on first use.
    // Deferred to next tick so DB is initialized before we query it.
    setImmediate(() => this._rewrapLegacy());
  }

  list() {
    return getDb().prepare('SELECT id, name, url, username, is_default, created_at, last_used_at FROM registries ORDER BY name').all();
  }

  get(id) {
    return getDb().prepare('SELECT * FROM registries WHERE id = ?').get(id);
  }

  create({ name, url, username, password, createdBy }) {
    const encrypted = password ? encrypt(password) : null;
    const result = getDb().prepare(
      'INSERT INTO registries (name, url, username, password_encrypted, created_by) VALUES (?, ?, ?, ?, ?)'
    ).run(name, url.replace(/\/+$/, ''), username || null, encrypted, createdBy);
    return result.lastInsertRowid;
  }

  update(id, { name, url, username, password }) {
    const db = getDb();
    if (password) {
      db.prepare('UPDATE registries SET name=?, url=?, username=?, password_encrypted=?, last_used_at=NULL WHERE id=?')
        .run(name, url.replace(/\/+$/, ''), username || null, encrypt(password), id);
    } else {
      db.prepare('UPDATE registries SET name=?, url=?, username=? WHERE id=?')
        .run(name, url.replace(/\/+$/, ''), username || null, id);
    }
  }

  remove(id) {
    getDb().prepare('DELETE FROM registries WHERE id = ?').run(id);
  }

  async testConnection(id) {
    const reg = this.get(id);
    if (!reg) throw new Error('Registry not found');
    try {
      const result = await this._apiCall(reg, '/v2/');
      return { ok: true, status: result.status };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async catalog(id, limit = 100) {
    const reg = this.get(id);
    if (!reg) throw new Error('Registry not found');
    const data = await this._apiCall(reg, `/v2/_catalog?n=${limit}`);
    getDb().prepare("UPDATE registries SET last_used_at = datetime('now') WHERE id = ?").run(id);
    return data.body?.repositories || [];
  }

  async tags(id, repo) {
    const reg = this.get(id);
    if (!reg) throw new Error('Registry not found');
    const data = await this._apiCall(reg, `/v2/${repo}/tags/list`);
    return data.body?.tags || [];
  }

  getAuthForImage(imageName) {
    const db = getDb();
    // Match registry URL from image name
    const registries = db.prepare('SELECT * FROM registries').all();
    for (const reg of registries) {
      const host = new URL(reg.url).hostname;
      if (imageName.startsWith(host + '/') || imageName.startsWith(host + ':')) {
        return {
          username: reg.username,
          password: reg.password_encrypted ? this._decryptLegacyOrNew(reg.password_encrypted) : '',
          serveraddress: reg.url,
        };
      }
    }
    return null;
  }

  /**
   * Decrypt a stored password — handles both new AES-GCM format and legacy XOR/base64 format.
   * Legacy format: starts with 'x:' (XOR encrypted) or is plain base64 (no key was set).
   */
  _decryptLegacyOrNew(stored) {
    if (!stored) return '';
    // Try new AES-GCM first (format: iv:tag:data — three hex segments separated by colons)
    // AES-GCM ciphertext has exactly 3 colon-delimited hex parts
    const parts = stored.split(':');
    if (parts.length === 3 && /^[0-9a-f]+$/i.test(parts[0])) {
      try {
        return decrypt(stored);
      } catch {
        // Fall through to legacy handling
      }
    }
    // Legacy XOR format: 'x:<base64>'
    if (stored.startsWith('x:')) {
      const key = config.security.encryptionKey;
      if (!key) return '';
      const encBuf = Buffer.from(stored.slice(2), 'base64');
      const keyBuf = Buffer.from(key, 'utf8');
      const decrypted = Buffer.alloc(encBuf.length);
      for (let i = 0; i < encBuf.length; i++) {
        decrypted[i] = encBuf[i] ^ keyBuf[i % keyBuf.length];
      }
      return decrypted.toString('utf8');
    }
    // Legacy plain base64 (no key was configured at save time)
    try {
      return Buffer.from(stored, 'base64').toString('utf8');
    } catch {
      return '';
    }
  }

  /**
   * One-time migration: re-encrypt any legacy XOR/base64 passwords with AES-GCM.
   * Safe to call on startup — skips rows already in AES-GCM format.
   */
  _rewrapLegacy() {
    try {
      const db = getDb();
      const rows = db.prepare('SELECT id, password_encrypted FROM registries WHERE password_encrypted IS NOT NULL').all();
      let rewrapped = 0;
      for (const row of rows) {
        const stored = row.password_encrypted;
        if (!stored) continue;
        // Check if already AES-GCM format (3 hex parts separated by colons)
        const parts = stored.split(':');
        if (parts.length === 3 && /^[0-9a-f]+$/i.test(parts[0])) {
          // Already new format — try decrypting to confirm
          try { decrypt(stored); continue; } catch { /* corrupted, try rewrap */ }
        }
        // Legacy format — decode and re-encrypt
        try {
          const plaintext = this._decryptLegacyOrNew(stored);
          if (plaintext) {
            const newEncrypted = encrypt(plaintext);
            db.prepare('UPDATE registries SET password_encrypted = ? WHERE id = ?').run(newEncrypted, row.id);
            rewrapped++;
          }
        } catch (err) {
          log.warn(`Failed to rewrap registry password for id=${row.id}: ${err.message}`);
        }
      }
      if (rewrapped > 0) {
        log.info(`Registry legacy password migration: rewrapped ${rewrapped} row(s) to AES-GCM`);
      }
    } catch (err) {
      log.warn(`Registry legacy rewrap skipped: ${err.message}`);
    }
  }

  _apiCall(reg, path) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, reg.url);
      const mod = url.protocol === 'https:' ? https : http;
      const headers = { 'Accept': 'application/json' };

      if (reg.username && reg.password_encrypted) {
        const pass = this._decryptLegacyOrNew(reg.password_encrypted);  // eslint-disable-line no-underscore-dangle
        headers['Authorization'] = 'Basic ' + Buffer.from(`${reg.username}:${pass}`).toString('base64');
      }

      const req = mod.get(url, { headers, timeout: 10000, rejectUnauthorized: false }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
  }
}

module.exports = new RegistryService();
