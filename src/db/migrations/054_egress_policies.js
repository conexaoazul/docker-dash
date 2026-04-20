'use strict';

// Outbound Network Filter — v6.7 (alpha.1: config layer only)
// See docs/planning/v6.7/outbound-filter/02-deep-spec.md §2

exports.up = function (db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS egress_policies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope_type TEXT NOT NULL CHECK (scope_type IN ('container', 'stack')),
      scope_key TEXT NOT NULL,
      host_id INTEGER NOT NULL DEFAULT 0,
      preset TEXT NOT NULL,
      allowlist TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'enforce' CHECK (mode IN ('enforce', 'audit-only')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (scope_type, scope_key, host_id)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_egress_policies_active ON egress_policies(active)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_egress_policies_scope ON egress_policies(scope_type, scope_key)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS egress_block_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      policy_id INTEGER NOT NULL REFERENCES egress_policies(id) ON DELETE CASCADE,
      container_id TEXT NOT NULL,
      hostname TEXT NOT NULL,
      port INTEGER NOT NULL,
      proto TEXT NOT NULL CHECK (proto IN ('tcp', 'udp')),
      reason TEXT NOT NULL,
      blocked_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_egress_block_log_policy ON egress_block_log(policy_id, blocked_at DESC)`);
};

exports.down = function (db) {
  db.exec(`DROP INDEX IF EXISTS idx_egress_block_log_policy`);
  db.exec(`DROP TABLE IF EXISTS egress_block_log`);
  db.exec(`DROP INDEX IF EXISTS idx_egress_policies_scope`);
  db.exec(`DROP INDEX IF EXISTS idx_egress_policies_active`);
  db.exec(`DROP TABLE IF EXISTS egress_policies`);
};
