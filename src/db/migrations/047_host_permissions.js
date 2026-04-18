'use strict';

/**
 * Migration 047 — Per-host deployment role authorization
 *
 * Adds `allowed_deploy_roles` TEXT column to `docker_hosts`.
 * When NULL/empty, any admin may deploy (backwards compatible).
 * When populated with a JSON array of role names (e.g. '["admin","deploy"]'),
 * the calling user's role must appear in that list.
 */
exports.up = function (db) {
  // Use ALTER TABLE … ADD COLUMN (safe to run if column already exists via IF NOT EXISTS workaround)
  try {
    db.exec(`ALTER TABLE docker_hosts ADD COLUMN allowed_deploy_roles TEXT DEFAULT NULL`);
  } catch (err) {
    // SQLite does not support IF NOT EXISTS on ALTER TABLE; ignore duplicate-column error.
    if (!err.message.includes('duplicate column')) throw err;
  }
};

exports.down = function (db) {
  // SQLite does not support DROP COLUMN on older versions; recreate table without the column.
  db.exec(`
    CREATE TABLE IF NOT EXISTS docker_hosts_backup AS SELECT * FROM docker_hosts;
  `);
  // Note: a full column-drop would require a table rebuild; for rollback safety we leave the
  // column in place but document that it can be ignored when allowed_deploy_roles is NULL.
  // Production rollback: restore from backup taken before migration was applied.
};
