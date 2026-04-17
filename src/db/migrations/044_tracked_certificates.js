'use strict';

exports.up = function (db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracked_certificates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      source_type TEXT NOT NULL DEFAULT 'uploaded',
      source_path TEXT DEFAULT '',
      pem_content TEXT DEFAULT '',
      subject TEXT DEFAULT '',
      issuer TEXT DEFAULT '',
      sans TEXT DEFAULT '',
      not_before TEXT,
      not_after TEXT,
      fingerprint_sha256 TEXT DEFAULT '',
      self_signed INTEGER NOT NULL DEFAULT 0,
      host_id INTEGER NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      last_checked_at TEXT,
      last_error TEXT DEFAULT '',
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tracked_certs_expiry ON tracked_certificates(not_after)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tracked_certs_host ON tracked_certificates(host_id)`);
};
