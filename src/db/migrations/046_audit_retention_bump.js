'use strict';

/**
 * Migration 046: Bump audit_retention_days setting default to 365 days (FIX #22)
 *
 * Up: Insert or update the app_settings row for AUDIT_RETENTION_DAYS to 365 if it
 *     currently holds the old default of 7 (or has never been set).
 *
 * Down: Restore to 7 days.
 */

exports.up = function (db) {
  // Only bump the default if the setting hasn't been explicitly configured
  // (i.e., it is still at the old default of 7 or doesn't exist).
  try {
    const existing = db.prepare("SELECT value FROM settings WHERE key = 'AUDIT_RETENTION_DAYS'").get();
    if (!existing) {
      db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('AUDIT_RETENTION_DAYS', '365', datetime('now'))").run();
    } else if (existing.value === '7') {
      db.prepare("UPDATE settings SET value = '365', updated_at = datetime('now') WHERE key = 'AUDIT_RETENTION_DAYS'").run();
    }
    // If a custom value is already set, leave it untouched.
  } catch {
    // settings table may not exist yet in early migration runs — safe to skip
  }
};

exports.down = function (db) {
  try {
    db.prepare("UPDATE settings SET value = '7', updated_at = datetime('now') WHERE key = 'AUDIT_RETENTION_DAYS'").run();
  } catch {
    // ignore
  }
};
