/**
 * Message templates per playbook (FR-11).
 *
 * These are fixed templates with placeholder substitution — not
 * unconstrained LLM generation — so every message sent is reviewable and
 * predictable ahead of time. Escalation across attempts is handled by
 * picking a different (harder-coded) template tier, never by asking a
 * model to "be more urgent."
 */

function formatRupees(amountPaise) {
  const rupees = (amountPaise || 0) / 100;
  return `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

// tier: 0 = first attempt, 1 = second, 2+ = final/escalated
const TEMPLATES = {
  retry_with_delay_and_nudge: {
    channel: 'email_sim',
    tiers: [
      (amt, link) => ({
        subject: 'Your payment didn’t go through',
        body: `Hi there,\n\nWe noticed your payment of ${amt} couldn't be completed due to insufficient balance. No rush — you can complete it whenever works for you:\n\n${link}\n\nThanks!`,
      }),
      (amt, link) => ({
        subject: 'Friendly reminder: payment still pending',
        body: `Hi again,\n\nJust a gentle reminder that your ${amt} payment is still pending. Complete it here whenever convenient:\n\n${link}`,
      }),
    ],
  },
  request_card_update: {
    channel: 'email_sim',
    tiers: [
      (amt, link) => ({
        subject: 'Your card on file has expired',
        body: `Hi there,\n\nThe card we have on file has expired, so your ${amt} payment couldn't go through. Please update your payment method here:\n\n${link}`,
      }),
      (amt, link) => ({
        subject: 'Action needed: update your payment method',
        body: `Hi again,\n\nWe still don't have a valid payment method on file. Please update it to complete your ${amt} payment:\n\n${link}`,
      }),
    ],
  },
  immediate_retry: {
    channel: 'auto_retry',
    tiers: [
      () => ({ subject: null, body: 'System auto-retry triggered. No customer contact made.' }),
    ],
  },
  remandate_request: {
    // Escalating urgency across attempts, still template-bound.
    channel: 'whatsapp_sim',
    tiers: [
      (amt, link) => ({
        subject: null,
        body: `Hi! Your autopay payment of ${amt} couldn't go through because your payment mandate has lapsed. Please re-authorize it here:\n${link}`,
      }),
      (amt, link) => ({
        subject: null,
        body: `Reminder: your ${amt} payment is still pending. Please re-authorize soon to avoid any interruption to your service:\n${link}`,
      }),
      (amt, link) => ({
        subject: null,
        body: `Last reminder: your subscription may be discontinued without this ${amt} payment. Please re-authorize right away:\n${link}`,
      }),
    ],
  },
  cart_recovery_link: {
    channel: 'whatsapp_sim',
    tiers: [
      (amt, link) => ({
        subject: null,
        body: `You left something in your cart! Complete your ${amt} purchase now:\n${link}\n(Limited-time — link expires soon)`,
      }),
    ],
  },
  manual_review_generic: {
    channel: 'email_sim',
    tiers: [
      (amt, link) => ({
        subject: 'We had trouble processing your payment',
        body: `Hi there,\n\nWe ran into an issue processing your ${amt} payment. You can try again here:\n\n${link}\n\nIf this keeps happening, please reach out to support.`,
      }),
    ],
  },
};

/**
 * Builds the message for a given playbook + attempt number.
 * Clamps to the last available tier if attemptsMade exceeds the template list
 * (i.e. repeats the final/most-urgent tier rather than erroring).
 */
function buildMessage(playbookName, attemptsMade, amountPaise, link) {
  const config = TEMPLATES[playbookName];
  if (!config) {
    throw new Error(`No message template configured for playbook: ${playbookName}`);
  }

  const tierIndex = Math.min(attemptsMade, config.tiers.length - 1);
  const amt = formatRupees(amountPaise);
  const { subject, body } = config.tiers[tierIndex](amt, link);

  return { channel: config.channel, subject, body };
}

module.exports = { buildMessage, TEMPLATES };