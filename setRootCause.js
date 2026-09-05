/**
 * Demo helper: force a case's root cause + playbook, and reset it back to
 * open with 0 attempts, so you can click "Trigger next action now" on the
 * dashboard and get a clean run through the playbook you want to show.
 *
 * Only for demo/testing use — this bypasses the real classifier entirely.
 *
 * Usage:
 *   node setRootCause.js <case_id> <root_cause>
 *
 * root_cause must be one of:
 *   insufficient_funds   -> email,    retry_with_delay_and_nudge
 *   card_expired         -> email,    request_card_update
 *   mandate_lapsed        -> whatsapp, remandate_request   (use this for a WhatsApp demo)
 *   checkout_abandoned   -> whatsapp, cart_recovery_link
 *
 * Example:
 *   node setRootCause.js d2e93eaa-3740-4969-bff8-effe7a885779 mandate_lapsed
 */

const db = require('./src/db/connection');
const { PLAYBOOK_BY_ROOT_CAUSE } = require('./src/services/classificationService');

const [, , caseId, rootCause] = process.argv;

if (!caseId || !rootCause) {
    console.error('Usage: node setRootCause.js <case_id> <root_cause>');
    console.error(`root_cause must be one of: ${Object.keys(PLAYBOOK_BY_ROOT_CAUSE).join(', ')}`);
    process.exit(1);
}

if (!PLAYBOOK_BY_ROOT_CAUSE[rootCause]) {
    console.error(`Unknown root_cause "${rootCause}". Must be one of: ${Object.keys(PLAYBOOK_BY_ROOT_CAUSE).join(', ')}`);
    process.exit(1);
}

const playbook = PLAYBOOK_BY_ROOT_CAUSE[rootCause];

const existing = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
if (!existing) {
    console.error(`No case found with id ${caseId}. Copy the id from the case detail page URL.`);
    process.exit(1);
}

db.prepare(`
  DELETE FROM actions
  WHERE case_id = ? AND channel != 'auto_retry'
`).run(caseId);

db.prepare(`
  DELETE FROM stopping_rule_log
  WHERE case_id = ?
`).run(caseId);

db.prepare(`
  UPDATE cases
  SET
    root_cause = ?,
    root_cause_reason = ?,
    playbook = ?,
    status = 'open',
    attempts_made = 0,
    updated_at = datetime('now')
  WHERE id = ?
`).run(
  rootCause,
  `Manually set to "${rootCause}" for demo purposes.`,
  playbook,
  caseId
);

console.log(`Case ${caseId} updated:`);
console.log(`  root_cause -> ${rootCause}`);
console.log(`  playbook   -> ${playbook}`);
console.log(`  status     -> open, attempts_made -> 0`);
console.log('');
console.log('Now go to the case detail page and click "Trigger next action now".');