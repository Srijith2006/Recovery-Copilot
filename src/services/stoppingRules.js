/**
 * Stopping-rule logic (FR-12 – FR-16). Pure functions, no DB access, so
 * they're easy to reason about and test independently of the playbook
 * executor that calls them.
 */

function hasExceededMaxAttempts(caseRow) {
  return caseRow.attempts_made >= caseRow.max_attempts;
}

/**
 * SQLite `datetime('now')` values are stored as 'YYYY-MM-DD HH:MM:SS' UTC,
 * with no 'T'/'Z' — need to normalize before Date can parse them correctly.
 */
function parseSqliteTimestamp(ts) {
  if (!ts) return null;
  return new Date(ts.replace(' ', 'T') + 'Z');
}

/**
 * FR-13: no case may be contacted more than once within the configured
 * window (default 24h). Returns true if the case was contacted too
 * recently and should NOT be contacted again right now.
 */
function isContactWindowViolated(lastContactedAt, windowHours) {
  if (!lastContactedAt) return false;
  const last = parseSqliteTimestamp(lastContactedAt);
  if (!last) return false;
  const hoursSince = (Date.now() - last.getTime()) / (1000 * 60 * 60);
  return hoursSince < windowHours;
}

/**
 * FR-15: risk_block is never auto-retried or auto-contacted — routes
 * straight to manual review the moment the case is created.
 */
function isRiskBlocked(caseRow) {
  return caseRow.root_cause === 'risk_block';
}

module.exports = {
  hasExceededMaxAttempts,
  isContactWindowViolated,
  isRiskBlocked,
  parseSqliteTimestamp,
};