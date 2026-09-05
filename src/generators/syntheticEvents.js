const { randomUUID } = require('crypto');

// Realistic-shaped Razorpay error codes/descriptions per root cause, so the
// classification engine (next build step) has real signal to work with
// instead of guessing from nothing.
const FAILURE_PROFILES = [
  {
    rootCauseHint: 'insufficient_funds',
    error_code: 'BAD_REQUEST_ERROR',
    error_reason: 'payment_failed',
    error_description: "Insufficient balance in the customer's account.",
    error_source: 'bank',
    error_step: 'payment_authorization',
  },
  {
    rootCauseHint: 'card_expired',
    error_code: 'BAD_REQUEST_ERROR',
    error_reason: 'card_expired',
    error_description: 'The card has expired.',
    error_source: 'gateway',
    error_step: 'payment_authorization',
  },
  {
    rootCauseHint: 'bank_timeout',
    error_code: 'GATEWAY_ERROR',
    error_reason: 'gateway_timeout',
    error_description: "The issuing bank's servers did not respond in time.",
    error_source: 'issuer',
    error_step: 'payment_authorization',
  },
  {
    rootCauseHint: 'risk_block',
    error_code: 'GATEWAY_ERROR',
    error_reason: 'risk_declined',
    error_description: 'The transaction was declined by the risk engine.',
    error_source: 'business',
    error_step: 'payment_authorization',
  },
  {
    rootCauseHint: 'unclassified',
    error_code: 'SERVER_ERROR',
    error_reason: 'server_error',
    error_description: 'An unexpected error occurred.',
    error_source: 'internal',
    error_step: 'payment_authorization',
  },
];

function randomAmount() {
  // paise; 199.00 to 4999.00 INR
  return Math.floor((199 + Math.random() * 4800) * 100);
}

function randomCustomer() {
  const n = Math.floor(Math.random() * 100000);
  return { id: `cust_synth_${n}`, email: `demo.customer${n}@example.com`, contact: `+9198${String(n).padStart(8, '0')}` };
}

function buildPaymentFailedEvent() {
  const profile = FAILURE_PROFILES[Math.floor(Math.random() * FAILURE_PROFILES.length)];
  const customer = randomCustomer();
  const paymentId = `pay_synth_${randomUUID().slice(0, 14)}`;
  const orderId = `order_synth_${randomUUID().slice(0, 14)}`;

  return {
    id: `evt_synth_${randomUUID()}`,
    event: 'payment.failed',
    created_at: Math.floor(Date.now() / 1000),
    payload: {
      payment: {
        entity: {
          id: paymentId,
          order_id: orderId,
          amount: randomAmount(),
          currency: 'INR',
          status: 'failed',
          email: customer.email,
          contact: customer.contact,
          error_code: profile.error_code,
          error_description: profile.error_description,
          error_source: profile.error_source,
          error_step: profile.error_step,
          error_reason: profile.error_reason,
          created_at: Math.floor(Date.now() / 1000),
        },
      },
    },
  };
}

function buildSubscriptionChargedFailedEvent() {
  const customer = randomCustomer();
  const subId = `sub_synth_${randomUUID().slice(0, 14)}`;
  const payId = `pay_synth_${randomUUID().slice(0, 14)}`;

  return {
    id: `evt_synth_${randomUUID()}`,
    event: 'subscription.charged.failed',
    created_at: Math.floor(Date.now() / 1000),
    payload: {
      subscription: { entity: { id: subId, customer_id: customer.id, status: 'active' } },
      payment: {
        entity: {
          id: payId,
          amount: randomAmount(),
          currency: 'INR',
          status: 'failed',
          email: customer.email,
          contact: customer.contact,
          error_code: 'BAD_REQUEST_ERROR',
          error_description: 'The mandate has lapsed and needs re-authorization.',
          error_source: 'bank',
          error_step: 'payment_authorization',
          error_reason: 'mandate_lapsed',
          created_at: Math.floor(Date.now() / 1000),
        },
      },
    },
  };
}

function buildSubscriptionHaltedEvent() {
  const customer = randomCustomer();
  const subId = `sub_synth_${randomUUID().slice(0, 14)}`;

  return {
    id: `evt_synth_${randomUUID()}`,
    event: 'subscription.halted',
    created_at: Math.floor(Date.now() / 1000),
    payload: {
      subscription: {
        entity: {
          id: subId,
          customer_id: customer.id,
          status: 'halted',
          email: customer.email,
          contact: customer.contact,
          amount: randomAmount(),
          currency: 'INR',
        },
      },
    },
  };
}

function buildCheckoutAbandonedEvent() {
  const customer = randomCustomer();
  const orderId = `order_synth_${randomUUID().slice(0, 14)}`;

  return {
    id: `evt_synth_${randomUUID()}`,
    event: 'checkout.abandoned',
    created_at: Math.floor(Date.now() / 1000),
    payload: {
      order: {
        entity: {
          id: orderId,
          amount: randomAmount(),
          currency: 'INR',
          status: 'created', // order was created, checkout started, never completed
          email: customer.email,
          contact: customer.contact,
          created_at: Math.floor(Date.now() / 1000),
        },
      },
    },
  };
}

function buildPaymentCapturedEvent(orderRef) {
  const customer = randomCustomer();
  return {
    id: `evt_synth_${randomUUID()}`,
    event: 'payment.captured',
    created_at: Math.floor(Date.now() / 1000),
    payload: {
      payment: {
        entity: {
          id: `pay_synth_${randomUUID().slice(0, 14)}`,
          order_id: orderRef || `order_synth_${randomUUID().slice(0, 14)}`,
          amount: randomAmount(),
          currency: 'INR',
          status: 'captured',
          email: customer.email,
          contact: customer.contact,
          created_at: Math.floor(Date.now() / 1000),
        },
      },
    },
  };
}

/**
 * Generates a batch of synthetic webhook-shaped events spanning the
 * supported failure types (FR-4). Default size 30-50 events, weighted
 * mostly toward failures with a handful of captures mixed in.
 */
function generateBatch(size = 40) {
  const events = [];
  for (let i = 0; i < size; i++) {
    const roll = Math.random();
    if (roll < 0.1) {
      events.push(buildCheckoutAbandonedEvent());
    } else if (roll < 0.22) {
      events.push(buildSubscriptionChargedFailedEvent());
    } else if (roll < 0.32) {
      events.push(buildSubscriptionHaltedEvent());
    } else if (roll < 0.92) {
      events.push(buildPaymentFailedEvent());
    } else {
      events.push(buildPaymentCapturedEvent());
    }
  }
  return events;
}

module.exports = {
  generateBatch,
  buildPaymentFailedEvent,
  buildSubscriptionChargedFailedEvent,
  buildSubscriptionHaltedEvent,
  buildCheckoutAbandonedEvent,
  buildPaymentCapturedEvent,
};