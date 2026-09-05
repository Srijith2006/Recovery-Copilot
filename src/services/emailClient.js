/**
 * Real email delivery for the email_sim channel (FR-11 extended: actually
 * send, not just simulate, when configured).
 *
 * Uses Resend (https://resend.com) — a simple REST API, no SMTP setup,
 * generous free tier. Falls back to "not sent" (simulated only) if no API
 * key is configured or the call fails, matching the same fail-soft pattern
 * as razorpayClient.js — a delivery problem should never break the
 * recovery pipeline itself.
 *
 * IMPORTANT — Resend sandbox restriction: until you verify your own
 * sending domain at resend.com/domains, Resend will only actually deliver
 * to the email address your Resend account itself is registered under.
 * Emails to any other address will be accepted by the API (200 OK) but
 * silently not delivered. This is a Resend platform limitation, not a bug
 * here — verify a domain for real multi-recipient sending.
 */

function isConfigured() {
  const key = process.env.RESEND_API_KEY;
  return Boolean(key && !key.startsWith('re_xxxx'));
}

function looksLikeEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Sends a real email via Resend.
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
async function sendEmail({ to, subject, body }) {
  if (!isConfigured()) {
    return { sent: false, reason: 'RESEND_API_KEY not configured' };
  }
  if (!looksLikeEmail(to)) {
    return { sent: false, reason: `recipient does not look like an email: ${to}` };
  }

  const fromAddress = process.env.EMAIL_FROM_ADDRESS || 'onboarding@resend.dev';
  const fromName = process.env.EMAIL_FROM_NAME || 'Recovery Copilot';

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${fromName} <${fromAddress}>`,
        to: [to],
        subject: subject || 'Complete your payment',
        text: body,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[emailClient] Resend API error:', response.status, errText);
      return { sent: false, reason: `Resend API error (${response.status})` };
    }

    return { sent: true };
  } catch (err) {
    console.error('[emailClient] Send failed:', err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = { sendEmail, isConfigured };