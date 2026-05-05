'use strict';

// v8.2.0 — pCloud backup target configuration.
//
// Single-row settings table (CHECK id = 1) so config lives in DB (UI-editable)
// rather than env (restart-required). Mirrors the shape of the s3 config but
// kept separate because pCloud's auth model (token from username/password)
// differs from S3's static accessKey/secretKey pair.
//
// Stores three orthogonal schedule + retention pairs (DB / stack / audit) so
// operators can decouple cadence per artifact kind without three settings tabs.

exports.up = function (db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pcloud_config (
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
      last_db_at TEXT,
      last_db_status TEXT,
      last_db_error TEXT,
      last_stack_at TEXT,
      last_stack_status TEXT,
      last_stack_error TEXT,
      last_audit_at TEXT,
      last_audit_status TEXT,
      last_audit_error TEXT,
      quota_total INTEGER,
      quota_used INTEGER,
      quota_checked_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.prepare('INSERT OR IGNORE INTO pcloud_config (id) VALUES (1)').run();
};

exports.down = function (db) {
  db.exec('DROP TABLE IF EXISTS pcloud_config');
};
