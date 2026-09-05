const crypto = require('crypto');

/**
 * Verifies a Razorpay webhook signature.
 * Razorpay signs the raw request body with HMAC-SHA256 using the webhook
 * secret, and sends the result in the `X-Razorpay-Signature` header.
 * https://razorpay.com/docs/webhooks/validate-test/
 *
 * @param {Buffer|string} rawBody - the exact raw request body bytes (NOT the parsed JSON)
 * @param {string} signatureHeader - value of the X-Razorpay-Signature header
 * @param {string} secret - the webhook secret configured in the Razorpay dashboard
 * @returns {boolean}
 */
function verifyRazorpaySignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret || !rawBody) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // timingSafeEqual requires equal-length buffers; mismatched length just means "not equal"
  const expectedBuf = Buffer.from(expected, 'utf8');
  const receivedBuf = Buffer.from(signatureHeader, 'utf8');

  if (expectedBuf.length !== receivedBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

module.exports = { verifyRazorpaySignature };