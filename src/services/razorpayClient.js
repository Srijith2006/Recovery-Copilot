/**
 * Razorpay Payment Links client (FR-9).
 *
 * Real mode: calls POST https://api.razorpay.com/v1/payment_links with
 * Basic Auth (key_id:key_secret), pre-filled with the case's original
 * amount and a note tying the link back to the case id.
 *
 * Simulate mode: if RAZORPAY_KEY_ID/SECRET aren't configured (still the
 * placeholder values from .env.example), or the real call fails, this
 * generates a fake-but-realistic link instead of blocking the whole
 * playbook engine. Every returned link is tagged `simulated: true|false`
 * so the audit trail is honest about which is which — never silently
 * pass off a fake link as a real one.
 */

const { randomUUID } = require('crypto');

function isConfigured() {
  const id = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  return Boolean(id && secret && !id.startsWith('rzp_test_xxxx') && !secret.startsWith('xxxx'));
}

function buildSimulatedLink(caseRow) {
  const fakeId = `plink_sim_${randomUUID().slice(0, 14)}`;
  return {
    razorpayLinkId: fakeId,
    shortUrl: `https://rzp.io/i/sim_${fakeId.slice(-8)}`,
    simulated: true,
  };
}

async function createRealPaymentLink(caseRow) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  const body = {
    amount: caseRow.amount, // paise, already in Razorpay's expected unit
    currency: caseRow.currency,
    description: `Recovery Copilot: complete your payment (case ${caseRow.id})`,
    // Razorpay requires reference_id to be unique per link across the whole
    // account. Using the bare case id caused every retry/re-trigger of the
    // same case to collide with the first link's reference_id and get
    // rejected with a 400 — silently falling back to a fake simulated link.
    // Appending the attempt number + a short random suffix keeps it unique
    // per attempt while still being traceable back to the case.
    reference_id: `${caseRow.id}-a${caseRow.attempts_made}-${randomUUID().slice(0, 6)}`,
    notify: { sms: false, email: false }, // we send our own simulated nudges, not Razorpay's
    reminder_enable: false,
    notes: { case_id: caseRow.id, root_cause: caseRow.root_cause },
  };

  const response = await fetch('https://api.razorpay.com/v1/payment_links', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Razorpay Payment Links API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return {
    razorpayLinkId: data.id,
    shortUrl: data.short_url,
    simulated: false,
  };
}

/**
 * Creates a payment link for a case, real or simulated depending on config.
 * Fails soft: if the real API call errors (bad keys, network unreachable,
 * etc.), falls back to a simulated link and logs why, rather than
 * blocking the recovery attempt entirely.
 */
async function createPaymentLink(caseRow) {
  if (!isConfigured()) {
    return buildSimulatedLink(caseRow);
  }

  try {
    return await createRealPaymentLink(caseRow);
  } catch (err) {
    console.error('[razorpayClient] Real Payment Link creation failed, falling back to simulated link:', err.message);
    return buildSimulatedLink(caseRow);
  }
}

module.exports = { createPaymentLink, isConfigured };