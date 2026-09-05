const { randomUUID } = require('crypto');
const db = require('../db/connection');

const SUPPORTED_TYPES = new Set([
  'payment.failed',
  'payment.captured',
  'payment.authorized',
  'subscription.charged.failed',
  'subscription.halted',
  'checkout.abandoned',
  'payment_link.paid',
  'payment_link.partially_paid',
  'payment_link.expired',
  'payment_link.cancelled',
]);

const insertStmt = db.prepare(`
  INSERT INTO events (id, razorpay_event_id, type, payload, idempotency_key)
  VALUES (@id, @razorpay_event_id, @type, @payload, @idempotency_key)
`);

const findByIdempotencyKeyStmt = db.prepare(`
  SELECT * FROM events WHERE idempotency_key = ?
`);

/**
 * Extracts the Razorpay event ID or entity ID from an inbound payload.
 */
function extractRazorpayEventId(body) {
  if (!body) return null;
  if (body.id) return body.id;
  if (body.event_id) return body.event_id;
  const payload = body.payload;
  if (payload) {
    if (payload.payment && payload.payment.entity && payload.payment.entity.id) {
      return payload.payment.entity.id;
    }
    if (payload.payment_link && payload.payment_link.entity && payload.payment_link.entity.id) {
      return payload.payment_link.entity.id;
    }
  }
  return null;
}

/**
 * Derives a stable idempotency key for an inbound Razorpay webhook payload.
 * Razorpay's event id (payload.id, e.g. "evt_xxx") plus event type is unique
 * per delivery and stable across retried deliveries of the same event.
 * Falls back to hashing the payload if no event id is present (shouldn't
 * happen with real Razorpay traffic, but keeps synthetic/malformed events safe).
 */
function deriveIdempotencyKey(body) {
  const eventId = extractRazorpayEventId(body);
  const type = body && body.event;
  if (eventId && type) return `${type}:${eventId}`;

  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  return `hash:${hash}`;
}

/**
 * Stores an inbound webhook event. If an event with the same idempotency
 * key already exists, returns the existing row with `duplicate: true`
 * instead of inserting again — this is what FR-3 requires: duplicate
 * deliveries must not create duplicate cases or double-count revenue.
 */
function recordEvent(body) {
  const type = body && body.event;
  if (!SUPPORTED_TYPES.has(type)) {
    const err = new Error(`Unsupported event type: ${type}`);
    err.statusCode = 400;
    throw err;
  }

  const idempotencyKey = deriveIdempotencyKey(body);

  const existing = findByIdempotencyKeyStmt.get(idempotencyKey);
  if (existing) {
    return { event: rowToEvent(existing), duplicate: true };
  }

  const row = {
    id: randomUUID(),
    razorpay_event_id: extractRazorpayEventId(body),
    type,
    payload: JSON.stringify(body),
    idempotency_key: idempotencyKey,
  };

  try {
    insertStmt.run(row);
  } catch (err) {
    // Race condition guard: two near-simultaneous deliveries of the same
    // event could both pass the SELECT above before either INSERTs.
    // The UNIQUE constraint on idempotency_key is the real source of truth.
    if (String(err.message).includes('UNIQUE constraint failed')) {
      const raceWinner = findByIdempotencyKeyStmt.get(idempotencyKey);
      return { event: rowToEvent(raceWinner), duplicate: true };
    }
    throw err;
  }

  const stored = findByIdempotencyKeyStmt.get(idempotencyKey);
  return { event: rowToEvent(stored), duplicate: false };
}

function rowToEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    razorpayEventId: row.razorpay_event_id,
    type: row.type,
    payload: JSON.parse(row.payload),
    receivedAt: row.received_at,
    idempotencyKey: row.idempotency_key,
  };
}

module.exports = { recordEvent, deriveIdempotencyKey, SUPPORTED_TYPES };