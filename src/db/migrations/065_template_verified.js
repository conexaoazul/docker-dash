'use strict';

// v8.3.0-prep — Template trust signals.
//
// Pragmatic problem (post-v8.2.0 audit): the 47 built-in templates + N user
// custom templates appear in one flat list with zero "is this current?" or
// "should I avoid this?" signal. AI workload templates ship with versions
// that move (Ollama 0.x → 0.y), upstream images get deprecated, etc.
//
// Two columns:
//   - verified_at: TEXT (ISO 8601 timestamp, nullable). When the maintainer
//     reviewed this template against the current upstream image and confirmed
//     it deploys cleanly. Stale = >180 days old in UI = warning badge.
//   - deprecated_in_favor_of: TEXT (template id, nullable). When set, the
//     UI shows "Use <other id> instead" and the template card is dimmed.
//
// Built-in templates inherit these from a static map in routes/templates.js
// (BUILTIN_VERIFICATION) — no migration needed for them. This migration only
// touches the custom_templates table for user-created templates.

exports.up = function (db) {
  // SQLite ALTER TABLE ADD COLUMN is allowed; idempotent guard via PRAGMA check.
  const cols = db.pragma('table_info(custom_templates)');
  const hasVerified = cols.some(c => c.name === 'verified_at');
  const hasDeprecated = cols.some(c => c.name === 'deprecated_in_favor_of');

  if (!hasVerified) {
    db.exec(`ALTER TABLE custom_templates ADD COLUMN verified_at TEXT`);
  }
  if (!hasDeprecated) {
    db.exec(`ALTER TABLE custom_templates ADD COLUMN deprecated_in_favor_of TEXT`);
  }
};

exports.down = function (db) {
  // SQLite < 3.35 doesn't support DROP COLUMN. Recreate without the columns.
  db.exec(`
    CREATE TABLE custom_templates_new (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Custom',
      icon TEXT NOT NULL DEFAULT 'fas fa-cube',
      description TEXT NOT NULL DEFAULT '',
      compose TEXT NOT NULL,
      is_builtin_override INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO custom_templates_new (id, name, category, icon, description, compose, is_builtin_override, created_by, created_at, updated_by, updated_at)
      SELECT id, name, category, icon, description, compose, is_builtin_override, created_by, created_at, updated_by, updated_at FROM custom_templates;
    DROP TABLE custom_templates;
    ALTER TABLE custom_templates_new RENAME TO custom_templates;
  `);
};
