const { randomUUID } = require('crypto');
const db = require('../db/connection');
const { classify, ROOT_CAUSES, PLAYBOOK_BY_ROOT_CAUSE } = require('./classificationService');
const { getMaxAttempts } = require('./configService');

const FAILURE_EVENT_TYPES = new Set([
  'payment.failed',
  'subscription.charged.failed',
  'subscription.halted',
  'checkout.abandoned',
  'payment_link.cancelled',
  'payment_link.expired',
]);

const insertCaseStmt = db.prepare(`
  INSERT INTO cases (id, event_id, customer_ref, customer_phone, amount, currency, root_cause, root_cause_reason, playbook, status, attempts_made, max_attempts)
  VALUES (@id, @event_id, @customer_ref, @customer_phone, @amount, @currency, @root_cause, @root_cause_reason, @playbook, 'open', 0, @max_attempts)
`);

const findOpenCasesByCustomerStmt = db.prepare(`
  SELECT * FROM cases
  WHERE customer_ref = ? AND status IN ('open', 'in_progress')
  ORDER BY created_at DESC
`);

const updateCaseStatusStmt = db.prepare(`
  UPDATE cases SET status = ?, updated_at = datetime('now') WHERE id = ?
`);

const findCaseByIdStmt = db.prepare(`SELECT * FROM cases WHERE id = ?`);

/**
 * Pulls the fields we need out of a Razorpay-shaped event payload.
 * Handles payment.failed, subscription events, checkout.abandoned, and Payment Links.
 */
function extractFailureDetails(event) {
  const payload = event.payload && event.payload.payload ? event.payload.payload : event.payload;

  if (event.type === 'checkout.abandoned') {
    const order = payload.order && payload.order.entity;
    return {
      customerRef: (order && (order.email || order.contact)) || (order && order.id) || 'unknown_customer',
      customerPhone: (order && order.contact) || null,
      amount: (order && order.amount) || 0,
      currency: (order && order.currency) || 'INR',
      errorDetails: {
        error_code: null,
        error_reason: 'checkout_abandoned',
        error_description: 'Checkout was started but never completed — no failure code was ever generated.',
        error_source: 'checkout_lifecycle',
      },
    };
  }

  if (event.type === 'subscription.halted') {
    const sub = payload.subscription && payload.subscription.entity;
    return {
      customerRef: (sub && (sub.email || sub.contact || sub.customer_id || sub.id)) || 'unknown_customer',
      customerPhone: (sub && sub.contact) || null,
      amount: (sub && sub.amount) || 0,
      currency: (sub && sub.currency) || 'INR',
      errorDetails: {
        error_code: null,
        error_reason: 'subscription_halted',
        error_description: 'Subscription was auto-halted by Razorpay after repeated charge failures.',
        error_source: 'subscription_lifecycle',
      },
    };
  }

  const payment = payload.payment && payload.payment.entity;
  const paymentLink = payload.payment_link && payload.payment_link.entity;
  const plCustomer = paymentLink && (paymentLink.customer || paymentLink.user);

  const email = (payment && payment.email) ||
                (plCustomer && plCustomer.email) ||
                (payment && payment.notes && (payment.notes.email || payment.notes.customer_email)) ||
                null;

  const phone = (payment && payment.contact) ||
                (plCustomer && (plCustomer.contact || plCustomer.phone)) ||
                (payment && payment.notes && (payment.notes.contact || payment.notes.customer_phone)) ||
                null;

  const customerRef = email || phone || (payment && payment.customer_id) || (paymentLink && paymentLink.id) || (payment && payment.id) || 'unknown_customer';
  const amount = (payment && payment.amount) || (paymentLink && paymentLink.amount) || 0;
  const currency = (payment && payment.currency) || (paymentLink && paymentLink.currency) || 'INR';

  return {
    customerRef,
    customerPhone: phone,
    amount,
    currency,
    // Razorpay TEST MODE decline signals are almost always generic
    // (error_code: BAD_REQUEST_ERROR, error_reason: payment_failed) rather
    // than the specific bank decline codes production traffic gets. If the
    // order/payment was tagged with a specific intended root cause in
    // notes (e.g. by a test/demo checkout flow), we surface it here so the
    // classifier can use it as a fallback instead of always landing on
    // "unclassified" when Razorpay's own signal is too generic to work with.
    notesRootCause: (payment && payment.notes && payment.notes.root_cause) ||
                     (paymentLink && paymentLink.notes && paymentLink.notes.root_cause) ||
                     null,
    errorDetails: {
      error_code: (payment && payment.error_code) || null,
      error_reason: (payment && payment.error_reason) || 'payment_failed',
      error_description: (payment && payment.error_description) || 'Payment failed on Payment Link',
      error_source: (payment && payment.error_source) || 'gateway',
    },
  };
}

function extractCapturedCustomerRef(event) {
  const payload = event.payload && event.payload.payload ? event.payload.payload : event.payload;
  const payment = payload.payment && payload.payment.entity;
  const paymentLink = payload.payment_link && payload.payment_link.entity;
  const plCustomer = paymentLink && (paymentLink.customer || paymentLink.user);

  return (
    (payment && (payment.email || payment.contact)) ||
    (plCustomer && (plCustomer.email || plCustomer.contact)) ||
    (payment && payment.notes && (payment.notes.email || payment.notes.contact)) ||
    null
  );
}

/**
 * Creates a classified case from a stored failure event (FR-5, FR-6, FR-7).
 * No-op (returns null) for event types that aren't failures — those are
 * handled by markRecoveredIfMatch instead.
 */
async function createCaseFromEvent(event) {
  if (!FAILURE_EVENT_TYPES.has(event.type)) return null;

  const { customerRef, customerPhone, amount, currency, errorDetails, notesRootCause } = extractFailureDetails(event);

  let classification;
  if (event.type === 'subscription.halted') {
    // No error-code signal available here at all — go straight to the
    // known cause rather than running it through the general classifier.
    classification = {
      rootCause: 'mandate_lapsed',
      reason: errorDetails.error_description,
      method: 'rule',
      confidence: 0.85,
      playbook: 'remandate_request',
    };
  } else if (event.type === 'checkout.abandoned') {
    // Root cause is definitionally known the moment this event exists —
    // no classification signal to weigh, so skip the classifier entirely.
    classification = {
      rootCause: 'checkout_abandoned',
      reason: errorDetails.error_description,
      method: 'rule',
      confidence: 1.0,
      playbook: 'cart_recovery_link',
    };
  } else {
    classification = await classify(errorDetails);

    // Razorpay's test-mode error signal was too generic for the rules/LLM
    // classifier to place confidently (landed on "unclassified"). If the
    // order/payment was explicitly tagged with an intended root cause in
    // notes for testing purposes, honor it instead of losing the case to
    // the generic manual-review bucket every time.
    const validOverrideCauses = ROOT_CAUSES.filter((c) => c !== 'unclassified' && c !== 'checkout_abandoned');
    if (classification.rootCause === 'unclassified' && validOverrideCauses.includes(notesRootCause)) {
      classification = {
        rootCause: notesRootCause,
        reason: `Razorpay's own decline signal was generic (error_code: ${errorDetails.error_code || 'n/a'}, error_reason: ${errorDetails.error_reason || 'n/a'}), so this case was classified using the root cause tagged on the order/payment notes for testing purposes.`,
        method: 'notes_override',
        confidence: 0.99,
        playbook: PLAYBOOK_BY_ROOT_CAUSE[notesRootCause],
      };
    }
  }

  const maxAttempts = getMaxAttempts();

  const row = {
    id: randomUUID(),
    event_id: event.id,
    customer_ref: customerRef,
    customer_phone: customerPhone,
    amount,
    currency,
    root_cause: classification.rootCause,
    root_cause_reason: classification.reason,
    playbook: classification.playbook,
    max_attempts: maxAttempts,
  };

  insertCaseStmt.run(row);

  return {
    ...row,
    status: 'open',
    attemptsMade: 0,
    classificationMethod: classification.method,
    classificationConfidence: classification.confidence,
  };
}

/**
 * On payment capture/authorization/payment_link.paid, checks for matching open cases
 * (first by case_id/reference_id, then by customer_ref) and marks as recovered.
 */
function markRecoveredIfMatch(event) {
  const recoveryEvents = new Set(['payment.captured', 'payment.authorized', 'payment_link.paid']);
  if (!recoveryEvents.has(event.type)) return null;

  const payload = event.payload && event.payload.payload ? event.payload.payload : event.payload;
  const payment = payload.payment && payload.payment.entity;
  const paymentLink = payload.payment_link && payload.payment_link.entity;

  // 1. Try direct case ID match via notes or reference_id
  const directCaseId =
    (payment && payment.notes && payment.notes.case_id) ||
    (paymentLink && paymentLink.notes && paymentLink.notes.case_id) ||
    (paymentLink && paymentLink.reference_id);

  if (directCaseId) {
    const targetCase = findCaseByIdStmt.get(directCaseId);
    if (targetCase && (targetCase.status === 'open' || targetCase.status === 'in_progress')) {
      updateCaseStatusStmt.run('recovered', targetCase.id);
      return { caseId: targetCase.id, customerRef: targetCase.customer_ref, previousStatus: targetCase.status };
    }
  }

  // 2. Fall back to customer_ref match
  const customerRef = extractCapturedCustomerRef(event);
  if (!customerRef) return null;

  const openCases = findOpenCasesByCustomerStmt.all(customerRef);
  if (openCases.length === 0) return null;

  const mostRecent = openCases[0];
  updateCaseStatusStmt.run('recovered', mostRecent.id);

  return { caseId: mostRecent.id, customerRef, previousStatus: mostRecent.status };
}

module.exports = { createCaseFromEvent, markRecoveredIfMatch, FAILURE_EVENT_TYPES };