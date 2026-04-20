'use strict';

// Container Remediation Wizard — v6.6
// See docs/planning/v6.6/remediation-wizard/01-feature-spec.md §7

exports.up = function (db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS remediation_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mode TEXT NOT NULL,
      scope_type TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      host_id INTEGER NOT NULL DEFAULT 0,
      plan_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      current_step TEXT DEFAULT '',
      output TEXT DEFAULT '',
      error_class TEXT,
      score_before INTEGER,
      score_after INTEGER,
      pre_apply_snapshot TEXT,
      git_branch TEXT,
      git_pr_url TEXT,
      rollback_deadline TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_remediation_jobs_status ON remediation_jobs(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_remediation_jobs_created_at ON remediation_jobs(created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_remediation_jobs_scope ON remediation_jobs(scope_type, scope_id)`);
};

exports.down = function (db) {
  db.exec(`DROP INDEX IF EXISTS idx_remediation_jobs_scope`);
  db.exec(`DROP INDEX IF EXISTS idx_remediation_jobs_created_at`);
  db.exec(`DROP INDEX IF EXISTS idx_remediation_jobs_status`);
  db.exec(`DROP TABLE IF EXISTS remediation_jobs`);
};
