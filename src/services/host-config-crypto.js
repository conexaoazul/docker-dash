'use strict';

const { encrypt, decrypt } = require('../utils/crypto');

/**
 * Encrypt an SSH config object for storage in the database.
 * Returns an AES-GCM encrypted string.
 */
function encryptSshConfig(plainObj) {
  return encrypt(JSON.stringify(plainObj));
}

/**
 * Decrypt a stored SSH config value.
 *
 * Handles three cases:
 *   1. null / empty → return null (no SSH config)
 *   2. Parses as JSON directly → legacy plaintext row; return the parsed object so
 *      callers can detect it (migration should re-encrypt it).
 *   3. Otherwise → treat as AES-GCM ciphertext; decrypt and parse.
 *
 * Callers that detect a legacy plaintext object (case 2) should re-encrypt and
 * persist the encrypted form as part of the 045 migration or on next write.
 */
function decryptSshConfig(stored) {
  if (!stored) return null;
  // Case 2: legacy plaintext JSON — return parsed object directly
  try {
    const parsed = JSON.parse(stored);
    // It parsed as JSON, so it is a plaintext (legacy) row.
    return parsed;
  } catch {
    // Not plain JSON — must be encrypted
  }
  // Case 3: AES-GCM encrypted blob
  return JSON.parse(decrypt(stored));
}

module.exports = { encryptSshConfig, decryptSshConfig };
