'use strict';

// v6.9.0 — Add scheduled_at column to remediation_jobs.
//
// Jobs created with a future scheduled_at sit in status='scheduled' until a
// background tick picks them up and transitions them through the normal
// pending → running → success/failed pipeline.

exports.up = function (db) {
  // SQLite doesn't support adding a column with a CHECK constraint modification
  // in one ALTER, so we rely on the service layer to validate status values.
  db.exec(`ALTER TABLE remediation_jobs ADD COLUMN scheduled_at TEXT`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_remediation_jobs_scheduled ON remediation_jobs(scheduled_at) WHERE status = 'scheduled'`);
};

exports.down = function (db) {
  db.exec(`DROP INDEX IF EXISTS idx_remediation_jobs_scheduled`);
  // Dropping a column in SQLite requires table rebuild; leave as-is on rollback.
  // Setting to NULL is safe because status='scheduled' rows would orphan otherwise.
  db.exec(`UPDATE remediation_jobs SET scheduled_at = NULL WHERE scheduled_at IS NOT NULL`);
};
