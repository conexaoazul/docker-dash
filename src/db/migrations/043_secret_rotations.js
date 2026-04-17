'use strict';

exports.up = function (db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS secret_rotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name TEXT NOT NULL DEFAULT '',
      host_id INTEGER NOT NULL DEFAULT 0,
      env_key TEXT NOT NULL,
      secret_name TEXT NOT NULL,
      secret_type TEXT NOT NULL DEFAULT 'generic_secret',
      label TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL DEFAULT 'manual',
      rotation_interval_days INTEGER NOT NULL DEFAULT 180,
      last_rotated_at TEXT NOT NULL DEFAULT (datetime('now')),
      next_due_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ok',
      notes TEXT DEFAULT '',
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(app_name, host_id, env_key)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS secret_rotation_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rotation_id INTEGER NOT NULL,
      rotated_at TEXT NOT NULL DEFAULT (datetime('now')),
      rotated_by INTEGER,
      rotated_by_name TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'rotated',
      notes TEXT DEFAULT '',
      FOREIGN KEY (rotation_id) REFERENCES secret_rotations(id) ON DELETE CASCADE
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_secret_rotations_next_due ON secret_rotations(next_due_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_secret_rotations_status ON secret_rotations(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_secret_rotations_host ON secret_rotations(host_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_secret_rotation_history_rotation ON secret_rotation_history(rotation_id)`);
};
