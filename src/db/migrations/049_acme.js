'use strict';

// Let's Encrypt Wizard tables — v6.5
// See docs/planning/v6.5/letsencrypt-wizard/02-feature-spec.md §7 for schema rationale.
// Three tables:
//   - acme_credentials      — user-saved DNS provider credentials (AES-GCM encrypted)
//   - acme_jobs             — issuance job log + progress
//   - acme_managed_certs    — registry of certificates managed by the wizard

exports.up = function (db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS acme_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      provider_id TEXT NOT NULL,
      credentials_encrypted TEXT NOT NULL,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT,
      last_validated_at TEXT,
      last_validation_status TEXT,
      last_validation_message TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_acme_credentials_provider ON acme_credentials(provider_id)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS acme_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domains TEXT NOT NULL,
      challenge_type TEXT NOT NULL,
      provider_id TEXT,
      credentials_id INTEGER,
      staging INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      output TEXT DEFAULT '',
      error_class TEXT,
      cert_id INTEGER,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT,
      FOREIGN KEY (credentials_id) REFERENCES acme_credentials(id) ON DELETE SET NULL,
      FOREIGN KEY (cert_id) REFERENCES tracked_certificates(id) ON DELETE SET NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_acme_jobs_status ON acme_jobs(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_acme_jobs_created_at ON acme_jobs(created_at)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS acme_managed_certs (
      domain TEXT PRIMARY KEY,
      challenge_type TEXT NOT NULL,
      provider_id TEXT,
      credentials_id INTEGER,
      staging INTEGER NOT NULL DEFAULT 0,
      caddy_policy_index INTEGER,
      cert_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (credentials_id) REFERENCES acme_credentials(id) ON DELETE RESTRICT,
      FOREIGN KEY (cert_id) REFERENCES tracked_certificates(id) ON DELETE SET NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_acme_managed_certs_credentials ON acme_managed_certs(credentials_id)`);
};

exports.down = function (db) {
  db.exec(`DROP INDEX IF EXISTS idx_acme_managed_certs_credentials`);
  db.exec(`DROP TABLE IF EXISTS acme_managed_certs`);
  db.exec(`DROP INDEX IF EXISTS idx_acme_jobs_created_at`);
  db.exec(`DROP INDEX IF EXISTS idx_acme_jobs_status`);
  db.exec(`DROP TABLE IF EXISTS acme_jobs`);
  db.exec(`DROP INDEX IF EXISTS idx_acme_credentials_provider`);
  db.exec(`DROP TABLE IF EXISTS acme_credentials`);
};
