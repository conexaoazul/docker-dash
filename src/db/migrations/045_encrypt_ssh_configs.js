'use strict';

/**
 * Migration 045: Encrypt existing plaintext SSH configs in docker_hosts.ssh_config
 *
 * Up: For each row where ssh_config is a valid JSON string (plaintext/legacy),
 *     re-encrypt it using AES-GCM via the host-config-crypto service.
 *     Rows that already appear to be encrypted (not valid JSON) are skipped.
 *
 * Down: Decrypt all AES-GCM encrypted ssh_config values back to plaintext JSON.
 *       This is a best-effort rollback — if the encryption key is unavailable,
 *       rows will be set to NULL to prevent broken configs.
 */

exports.up = function (db) {
  // Path is relative to this file: src/db/migrations/ → ../../services/
  const { encryptSshConfig } = require('../../services/host-config-crypto');

  const rows = db.prepare(
    "SELECT id, ssh_config FROM docker_hosts WHERE ssh_config IS NOT NULL AND ssh_config != ''"
  ).all();

  let encrypted = 0;
  let skipped = 0;

  for (const row of rows) {
    let parsed;
    try {
      parsed = JSON.parse(row.ssh_config);
    } catch {
      // Not valid JSON → already encrypted (or corrupted) — skip
      skipped++;
      continue;
    }

    // It's plaintext JSON — encrypt it
    try {
      const blob = encryptSshConfig(parsed);
      db.prepare('UPDATE docker_hosts SET ssh_config = ? WHERE id = ?').run(blob, row.id);
      encrypted++;
    } catch (err) {
       
      console.warn(`[045] Failed to encrypt ssh_config for host id=${row.id}: ${err.message}`);
      skipped++;
    }
  }

   
  console.log(`[045] SSH config encryption: ${encrypted} encrypted, ${skipped} skipped`);
};

exports.down = function (db) {
  // Path is relative to this file: src/db/migrations/ → ../../services/
  let decryptSshConfig;
  try {
    ({ decryptSshConfig } = require('../../services/host-config-crypto'));
  } catch {
     
    console.warn('[045 down] Cannot load host-config-crypto — setting encrypted rows to NULL');
    db.prepare(
      "UPDATE docker_hosts SET ssh_config = NULL WHERE ssh_config IS NOT NULL AND ssh_config != '' AND ssh_config NOT LIKE '{%'"
    ).run();
    return;
  }

  const rows = db.prepare(
    "SELECT id, ssh_config FROM docker_hosts WHERE ssh_config IS NOT NULL AND ssh_config != ''"
  ).all();

  let decrypted = 0;
  let skipped = 0;

  for (const row of rows) {
    // If it parses as JSON, it's already plaintext — skip
    try {
      JSON.parse(row.ssh_config);
      skipped++;
      continue;
    } catch { /* encrypted */ }

    try {
      const plain = decryptSshConfig(row.ssh_config);
      if (plain) {
        db.prepare('UPDATE docker_hosts SET ssh_config = ? WHERE id = ?')
          .run(JSON.stringify(plain), row.id);
        decrypted++;
      } else {
        db.prepare('UPDATE docker_hosts SET ssh_config = NULL WHERE id = ?').run(row.id);
        skipped++;
      }
    } catch (err) {
       
      console.warn(`[045 down] Failed to decrypt ssh_config for host id=${row.id}: ${err.message}`);
      db.prepare('UPDATE docker_hosts SET ssh_config = NULL WHERE id = ?').run(row.id);
      skipped++;
    }
  }

   
  console.log(`[045 down] SSH config decryption: ${decrypted} decrypted, ${skipped} skipped`);
};
