'use strict';

const { getDb } = require('../../db');

/**
 * Clear must_change_password flag for a user so tests can log in without
 * being blocked by the FIX #21 PASSWORD_CHANGE_REQUIRED enforcement.
 */
function clearMustChange(username = 'admin') {
  try {
    const db = getDb();
    db.prepare('UPDATE users SET must_change_password = 0 WHERE username = ?').run(username);
  } catch { /* DB may not be initialized yet */ }
}

module.exports = { clearMustChange };
