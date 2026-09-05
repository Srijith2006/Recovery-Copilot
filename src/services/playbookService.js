const { randomUUID } = require('crypto');
const db = require('../db/connection');
const { createPaymentLink } = require('./razorpayClient');
const { buildMessage } = require('./messageTemplates');
const { getContactWindowHours } = require('./configService');
const { sendEmail } = require('./emailClient');
const { sendWhatsApp } = require('./twilioClient');
const {
  hasExceededMaxAttempts,
  isContactWindowViolated,
  isRiskBlocked,
} = require('./stoppingRules');

// Per-playbook execution config (FR-8). Keyed by the `playbook` string
// stored on the case (assigned by classificationService).
const PLAYBOOK_CONFIG = {
  retry_with_delay_and_nudge: { requiresPaymentLink: true, isCustomerContact: true },
  request_card_update: { requiresPaymentLink: true, isCustomerContact: true },
  immediate_retry: { requiresPaymentLink: false, isCustomerContact: false }, // silent, no contact-window throttle
  remandate_request: { requiresPaymentLink: true, isCustomerContact: true },
  manual_review_hold: { requiresPaymentLink: false, isCustomerContact: false, autoStopImmediately: true },
  cart_recovery_link: { requiresPaymentLink: true, isCustomerContact: true, maxAttemptsOverride: 1 },
  manual_review_generic: { requiresPaymentLink: true, isCustomerContact: true, maxAttemptsOverride: 1 },
};

const getCaseStmt = db.prepare(`SELECT * FROM cases WHERE id = ?`);
const updateCaseProgressStmt = db.prepare(`
  UPDATE cases SET attempts_made = attempts_made + 1, status = 'in_progress', updated_at = datetime('now')
  WHERE id = ?
`);
const updateCaseStatusStmt = db.prepare(`
  UPDATE cases SET status = ?, updated_at = datetime('now') WHERE id = ?
`);
const insertActionStmt = db.prepare(`
  INSERT INTO actions (id, case_id, channel, message_content, delivered_real, outcome)
  VALUES (@id, @case_id, @channel, @message_content, @delivered_real, 'pending')
`);
const lastContactActionStmt = db.prepare(`
  SELECT sent_at FROM actions
  WHERE case_id = ? AND channel != 'auto_retry'
  ORDER BY sent_at DESC LIMIT 1
`);
const insertPaymentLinkStmt = db.prepare(`
  INSERT INTO payment_links (id, case_id, razorpay_link_id, short_url, status)
  VALUES (@id, @case_id, @razorpay_link_id, @short_url, 'created')
`);
const insertStoppingLogStmt = db.prepare(`
  INSERT INTO stopping_rule_log (id, case_id, reason, detail)
  VALUES (@id, @case_id, @reason, @detail)
`);

function stopCase(caseRow, reason, detail) {
  updateCaseStatusStmt.run('stopped', caseRow.id);
  insertStoppingLogStmt.run({
    id: randomUUID(),
    case_id: caseRow.id,
    reason,
    detail,
  });
  return { stopped: true, reason, detail };
}

function logThrottled(caseRow, detail) {
  // Contact-window throttling doesn't stop the case permanently — it's
  // logged for auditability (FR-16) but the case stays open/in_progress
  // for a later attempt once the window clears.
  insertStoppingLogStmt.run({
    id: randomUUID(),
    case_id: caseRow.id,
    reason: 'contact_window_violated',
    detail,
  });
}

/**
 * Runs the next recovery step for a case: checks stopping rules first,
 * then (if clear) generates a Payment Link where the playbook calls for
 * one, sends the templated message, logs the action, and advances the
 * case's attempt counter. Idempotent-ish in intent — calling this on a
 * terminal-status case is a safe no-op.
 */
async function executeNextStep(caseId) {
  const caseRow = getCaseStmt.get(caseId);
  if (!caseRow) {
    return { ok: false, reason: 'case_not_found' };
  }

  if (caseRow.status === 'recovered' || caseRow.status === 'stopped') {
    return { ok: false, skipped: true, reason: 'terminal_status', status: caseRow.status };
  }

  const config = PLAYBOOK_CONFIG[caseRow.playbook];
  if (!config) {
    return { ok: false, reason: `unknown_playbook: ${caseRow.playbook}` };
  }

  // FR-15: risk_block never gets auto-contacted — straight to manual review.
  if (config.autoStopImmediately || isRiskBlocked(caseRow)) {
    const result = stopCase(caseRow, 'risk_blocked', 'Root cause is risk_block — routed to manual merchant review, no automated contact made.');
    return { ok: true, action: 'stopped', ...result };
  }

  // Some playbooks cap attempts below the case's stored max_attempts
  // (e.g. unclassified / checkout_abandoned get a single try).
  const effectiveMaxAttempts = config.maxAttemptsOverride != null
    ? Math.min(caseRow.max_attempts, config.maxAttemptsOverride)
    : caseRow.max_attempts;
  const effectiveCaseRow = { ...caseRow, max_attempts: effectiveMaxAttempts };

  // FR-12 / FR-14: max attempts guard.
  if (hasExceededMaxAttempts(effectiveCaseRow)) {
    const result = stopCase(
      caseRow,
      'max_attempts_reached',
      `Case reached its maximum of ${effectiveMaxAttempts} recovery attempt(s) with no successful capture.`
    );
    return { ok: true, action: 'stopped', ...result };
  }

  // FR-13: contact-window throttle (only applies to actual customer contact).
  const windowHours = getContactWindowHours();
  if (config.isCustomerContact) {
    const lastContact = lastContactActionStmt.get(caseRow.id);
    if (lastContact && isContactWindowViolated(lastContact.sent_at, windowHours)) {
      logThrottled(
        caseRow,
        `Skipped: last customer contact was within the ${windowHours}h window (at ${lastContact.sent_at}).`
      );
      return { ok: true, action: 'throttled', reason: 'contact_window_violated' };
    }
  }

  // Clear to execute this step.
  let shortUrl = null;
  if (config.requiresPaymentLink) {
    const link = await createPaymentLink(caseRow);
    insertPaymentLinkStmt.run({
      id: randomUUID(),
      case_id: caseRow.id,
      razorpay_link_id: link.razorpayLinkId,
      short_url: link.shortUrl,
    });
    shortUrl = link.shortUrl;
  }

  const message = buildMessage(caseRow.playbook, caseRow.attempts_made, caseRow.amount, shortUrl);

  // If this is an email or WhatsApp-style message, attempt REAL delivery.
  // Voice-style stays simulated — no real voice/ASR integration, per the
  // PRD's explicit non-goals. Fails soft: a delivery problem never blocks
  // the recovery attempt from being logged and counted.
  let deliveredReal = false;
  if (message.channel === 'email_sim') {
    const sendResult = await sendEmail({
      to: caseRow.customer_ref,
      subject: message.subject,
      body: message.body,
    });
    deliveredReal = sendResult.sent;
    if (!sendResult.sent) {
      console.warn(`[playbookService] Email not actually delivered for case ${caseRow.id}: ${sendResult.reason}`);
    }
  } else if (message.channel === 'whatsapp_sim') {
    const sendResult = await sendWhatsApp({
      to: caseRow.customer_phone,
      body: message.body,
    });
    deliveredReal = sendResult.sent;
    if (!sendResult.sent) {
      console.warn(`[playbookService] WhatsApp not actually delivered for case ${caseRow.id}: ${sendResult.reason}`);
    }
  }

  insertActionStmt.run({
    id: randomUUID(),
    case_id: caseRow.id,
    channel: message.channel,
    message_content: message.subject ? `${message.subject}\n\n${message.body}` : message.body,
    delivered_real: deliveredReal ? 1 : 0,
  });

  updateCaseProgressStmt.run(caseRow.id);

  return {
    ok: true,
    action: 'executed',
    channel: message.channel,
    paymentLinkUrl: shortUrl,
    attemptNumber: caseRow.attempts_made + 1,
    deliveredReal: (message.channel === 'email_sim' || message.channel === 'whatsapp_sim') ? deliveredReal : null,
  };
}

module.exports = { executeNextStep, PLAYBOOK_CONFIG };