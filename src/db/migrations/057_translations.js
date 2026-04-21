'use strict';

// v6.11.0 — Translation management with Google Translate + DeepL integration.
//
// Three tables:
//   - translation_providers  — encrypted API keys + per-provider config
//   - translation_usage      — monthly char counter, one row per (provider, year_month)
//   - translations           — per-language/key cache with review workflow
//
// Design: providers are AES-GCM-encrypted (same pattern as notification_channels
// and acme_credentials). Usage increments are done inside a transaction with
// the translate call so we never undercount. Translations stay in-DB until the
// admin explicitly exports them to a locale file — we do NOT mutate files
// from the UI (safer + user controls git history).

exports.up = function (db) {
  // Providers — one row per configured service (typically 2: google + deepl)
  db.exec(`
    CREATE TABLE IF NOT EXISTS translation_providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL UNIQUE CHECK (provider IN ('google', 'deepl')),
      api_key_encrypted TEXT NOT NULL,
      monthly_limit INTEGER NOT NULL DEFAULT 500000,
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Usage — one row per (provider, year_month). Incremented atomically.
  db.exec(`
    CREATE TABLE IF NOT EXISTS translation_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      year_month TEXT NOT NULL,
      chars_used INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (provider, year_month)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_translation_usage_ym ON translation_usage(year_month)`);

  // Translations — one row per (language, key). Review states: pending (just
  // auto-translated, awaiting review), accepted (admin approved, ready to
  // export), rejected (admin dismissed; kept for history), applied (already
  // written to the locale file via export).
  db.exec(`
    CREATE TABLE IF NOT EXISTS translations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      language TEXT NOT NULL,
      key TEXT NOT NULL,
      source_text TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'applied')),
      chars_used INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (language, key)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_translations_lang_status ON translations(language, status)`);
};

exports.down = function (db) {
  db.exec(`DROP INDEX IF EXISTS idx_translations_lang_status`);
  db.exec(`DROP TABLE IF EXISTS translations`);
  db.exec(`DROP INDEX IF EXISTS idx_translation_usage_ym`);
  db.exec(`DROP TABLE IF EXISTS translation_usage`);
  db.exec(`DROP TABLE IF EXISTS translation_providers`);
};
