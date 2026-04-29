'use strict';

// v8.1.0 — Registry repository typing (local / remote / virtual) +
// retention policies.
//
// Single migration shared by two features:
//   - Retention Policies (this release) uses registry_repos as the row
//     each policy attaches to.
//   - Remote/Virtual Repositories (this release) uses registry_repos to
//     store the repo type + upstream URL + virtual member list.
//
// Doing it in one migration avoids a v8.1.0a / v8.1.0b two-step.

exports.up = function (db) {
  // Per-registry-credential repository entries. The same Distribution
  // registry hosts multiple repos; we annotate each with its type so
  // retention rules and UI affordances vary per repo.
  db.exec(`
    CREATE TABLE IF NOT EXISTS registry_repos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registry_id INTEGER NOT NULL REFERENCES registries(id) ON DELETE CASCADE,
      repo_path TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('local', 'remote', 'virtual')),
      upstream_url TEXT,
      upstream_username TEXT,
      upstream_password_encrypted TEXT,
      virtual_member_ids TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER REFERENCES users(id),
      UNIQUE (registry_id, repo_path)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_registry_repos_type ON registry_repos(type)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_registry_repos_registry ON registry_repos(registry_id)`);

  // Retention policies. One per registry_repos row. ON DELETE CASCADE so
  // removing a registry credential or repo entry takes its policy too.
  db.exec(`
    CREATE TABLE IF NOT EXISTS retention_policies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registry_repo_id INTEGER NOT NULL REFERENCES registry_repos(id) ON DELETE CASCADE,
      rule_json TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      schedule_cron TEXT NOT NULL DEFAULT '17 3 * * *',
      last_run_at TEXT,
      last_run_summary TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER REFERENCES users(id),
      UNIQUE (registry_repo_id)
    )
  `);
};

exports.down = function (db) {
  db.exec(`DROP TABLE IF EXISTS retention_policies`);
  db.exec(`DROP TABLE IF EXISTS registry_repos`);
};
