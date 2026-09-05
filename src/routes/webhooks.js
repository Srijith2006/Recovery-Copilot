const express = require('express');
const { verifyRazorpaySignature } = require('../utils/verifySignature');
const { recordEvent } = require('../services/eventService');
const { createCaseFromEvent, markRecoveredIfMatch } = require('../services/caseService');
const { executeNextStep } = require('../services/playbookService');

const router = express.Router();

// This route needs the raw body for HMAC verification, so it uses its own
// express.json({ verify }) instance rather than relying on a global parser.
router.post(
  '/razorpay',
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
  async (req, res) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.header('X-Razorpay-Signature');

    if (secret && signature) {
      const valid = verifyRazorpaySignature(req.rawBody, signature, secret);
      if (!valid) {
        console.warn(
          '[webhooks/razorpay] Webhook signature mismatch. Allowing payload in test mode. Set STRICT_WEBHOOK_SIGNATURE=true to enforce strict 401.'
        );
        if (process.env.STRICT_WEBHOOK_SIGNATURE === 'true') {
          return res.status(401).json({ error: 'Invalid webhook signature' });
        }
      }
    } else {
      console.warn(
        '[webhooks/razorpay] Webhook signature or secret omitted — processing payload in test mode.'
      );
    }

    try {
      const { event, duplicate } = recordEvent(req.body);

      let caseCreated = null;
      let recoveryMatch = null;
      let playbookResult = null;

      if (!duplicate) {
        caseCreated = await createCaseFromEvent(event);
        recoveryMatch = markRecoveredIfMatch(event);
        if (caseCreated) {
          playbookResult = await executeNextStep(caseCreated.id);
        }
      }

      return res.status(200).json({
        received: true,
        duplicate,
        eventId: event.id,
        type: event.type,
        caseId: caseCreated ? caseCreated.id : null,
        recoveredCaseId: recoveryMatch ? recoveryMatch.caseId : null,
        playbookAction: playbookResult ? playbookResult.action : null,
      });
    } catch (err) {
      console.error('[webhooks/razorpay] Error processing webhook:', err);
      const status = err.statusCode || 500;
      return res.status(status).json({ error: err.message });
    }
  }
);

module.exports = router;