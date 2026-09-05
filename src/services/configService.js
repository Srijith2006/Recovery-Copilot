const db = require('../db/connection');

const getStmt = db.prepare(`SELECT value FROM settings WHERE key = ?`);
const upsertStmt = db.prepare(`
  INSERT INTO settings (key, value, updated_at) VALUES (@key, @value, datetime('now'))
  ON CONFLICT(key) DO UPDATE SET value = @value, updated_at = datetime('now')
`);

const DEFAULTS = {
  max_attempts: () => Number(process.env.MAX_RECOVERY_ATTEMPTS) || 3,
  contact_window_hours: () => Number(process.env.CONTACT_WINDOW_HOURS) || 24,
};

/**
 * Reads a runtime setting, falling back to the .env default if it hasn't
 * been overridden via the settings screen. This is what lets the stretch
 * "Settings" screen adjust stopping-rule behavior without a redeploy.
 */
function getSetting(key) {
  const row = getStmt.get(key);
  if (row) return Number(row.value);
  const fallback = DEFAULTS[key];
  return fallback ? fallback() : null;
}

function setSetting(key, value) {
  if (!(key in DEFAULTS)) {
    throw new Error(`Unknown setting: ${key}`);
  }
  upsertStmt.run({ key, value: String(value) });
}

function getMaxAttempts() {
  return getSetting('max_attempts');
}

function getContactWindowHours() {
  return getSetting('contact_window_hours');
}

function getAllSettings() {
  return {
    max_attempts: getMaxAttempts(),
    contact_window_hours: getContactWindowHours(),
  };
}

module.exports = { getSetting, setSetting, getMaxAttempts, getContactWindowHours, getAllSettings };