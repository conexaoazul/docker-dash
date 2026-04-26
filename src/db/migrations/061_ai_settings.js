'use strict';

// v8.0.0 — AI features global config (single-row settings table).
//
// One row only (CHECK id = 1). Holds the operator's BYOK provider config:
// which provider, which model, encrypted API key (or Ollama URL), and
// optional custom redaction patterns. AI features are off by default
// (enabled = 0) — operator must explicitly configure + enable.
//
// API key is encrypted via src/utils/crypto.js (AES-GCM, same as registry
// passwords). NEVER returned in API responses unmasked.

exports.up = function (db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER NOT NULL DEFAULT 0,
      provider TEXT,
      model TEXT,
      api_key_encrypted TEXT,
      endpoint_url TEXT,
      custom_redaction_patterns TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER REFERENCES users(id)
    )
  `);
  // Seed the single row so reads always succeed (no special-case empty state)
  db.exec(`INSERT OR IGNORE INTO ai_settings (id, enabled) VALUES (1, 0)`);
};

exports.down = function (db) {
  db.exec(`DROP TABLE IF EXISTS ai_settings`);
};
