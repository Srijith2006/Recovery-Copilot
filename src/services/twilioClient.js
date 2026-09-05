/**
 * Real WhatsApp delivery for the whatsapp_sim channel, via Twilio's
 * WhatsApp Sandbox (https://www.twilio.com/docs/whatsapp/sandbox) — no
 * full WhatsApp Business API approval needed, exactly the kind of
 * lightweight setup that fits a demo/testing use case.
 *
 * Falls back to "not sent" (simulated only) if not configured or the call
 * fails — same fail-soft pattern as emailClient.js and razorpayClient.js.
 * A delivery problem should never block the recovery pipeline itself.
 *
 * IMPORTANT — Sandbox restriction: Twilio's WhatsApp sandbox will only
 * deliver to a phone number that has first "joined" the sandbox by
 * sending the join code (shown in your Twilio Console under
 * Messaging -> Try it out -> Send a WhatsApp message) to the sandbox
 * number from that phone's own WhatsApp. Numbers that haven't joined
 * will not receive anything, even though the API call still returns
 * success. This is a Twilio sandbox limitation, not a bug here — move to
 * an approved WhatsApp Business sender for unrestricted recipients.
 */

function isConfigured() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  return Boolean(sid && token && !sid.startsWith('ACxxxx') && !token.startsWith('xxxx'));
}

function looksLikePhone(value) {
  return typeof value === 'string' && /^\+\d{7,15}$/.test(value);
}

/**
 * Sends a real WhatsApp message via Twilio.
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
async function sendWhatsApp({ to, body }) {
  if (!isConfigured()) {
    return { sent: false, reason: 'TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN not configured' };
  }
  if (!looksLikePhone(to)) {
    return { sent: false, reason: `recipient is not a valid E.164 phone number: ${to}` };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  let rawFrom = process.env.TWILIO_WHATSAPP_FROM || '+14155238886';
  const fromNumber = rawFrom.startsWith('whatsapp:') ? rawFrom : `whatsapp:${rawFrom}`;

  const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  const params = new URLSearchParams({
    From: fromNumber,
    To: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
    Body: body,
  });

  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[twilioClient] Twilio API error:', response.status, errText);
      return { sent: false, reason: `Twilio API error (${response.status})` };
    }

    return { sent: true };
  } catch (err) {
    console.error('[twilioClient] Send failed:', err.message);
    return { sent: false, reason: err.message };
  }
}

/**
 * Sends a real SMS via Twilio.
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
async function sendSMS({ to, body }) {
  if (!isConfigured()) {
    return { sent: false, reason: 'TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN not configured' };
  }
  if (!looksLikePhone(to)) {
    return { sent: false, reason: `recipient is not a valid E.164 phone number: ${to}` };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = (process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_WHATSAPP_FROM || '').replace(/^whatsapp:/, '');

  const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  const params = new URLSearchParams({
    From: fromNumber,
    To: to.replace(/^whatsapp:/, ''),
    Body: body,
  });

  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[twilioClient] Twilio SMS API error:', response.status, errText);
      return { sent: false, reason: `Twilio SMS API error (${response.status})` };
    }

    return { sent: true };
  } catch (err) {
    console.error('[twilioClient] SMS Send failed:', err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = { sendWhatsApp, sendSMS, isConfigured };