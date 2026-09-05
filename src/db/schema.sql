-- Recovery Copilot schema
-- Mirrors PRD section 8 (Data Model)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS events (
  id                  TEXT PRIMARY KEY,             -- uuid
  razorpay_event_id   TEXT,
  type                TEXT NOT NULL CHECK (type IN (
                          'payment.failed',
                          'payment.captured',
                          'payment.authorized',
                          'subscription.charged.failed',
                          'subscription.halted',
                          'checkout.abandoned',
                          'payment_link.paid',
                          'payment_link.partially_paid',
                          'payment_link.expired',
                          'payment_link.cancelled'
                        )),
  payload             TEXT NOT NULL,                 -- raw JSON, stored as text
  received_at         TEXT NOT NULL DEFAULT (datetime('now')),
  idempotency_key     TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS cases (
  id                  TEXT PRIMARY KEY,             -- uuid
  event_id            TEXT NOT NULL REFERENCES events(id),
  customer_ref        TEXT NOT NULL,
  customer_phone      TEXT,                          -- E.164 format, used for real WhatsApp delivery
  amount              INTEGER NOT NULL,              -- paise
  currency             TEXT NOT NULL DEFAULT 'INR',
  root_cause          TEXT NOT NULL CHECK (root_cause IN (
                          'insufficient_funds',
                          'card_expired',
                          'bank_timeout',
                          'mandate_lapsed',
                          'risk_block',
                          'checkout_abandoned',
                          'unclassified'
                        )),
  root_cause_reason   TEXT NOT NULL,                 -- stored, not generated on the fly
  playbook            TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
                          'open', 'in_progress', 'recovered', 'stopped'
                        )),
  attempts_made       INTEGER NOT NULL DEFAULT 0,
  max_attempts        INTEGER NOT NULL DEFAULT 3,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS actions (
  id                  TEXT PRIMARY KEY,             -- uuid
  case_id             TEXT NOT NULL REFERENCES cases(id),
  channel             TEXT NOT NULL CHECK (channel IN (
                          'payment_link', 'email_sim', 'whatsapp_sim', 'voice_sim', 'auto_retry'
                        )),
  message_content     TEXT,
  sent_at             TEXT NOT NULL DEFAULT (datetime('now')),
  delivered_real      INTEGER NOT NULL DEFAULT 0,        -- 1 if actually sent via a real provider (email/WhatsApp), 0 if simulated
  outcome             TEXT NOT NULL DEFAULT 'pending' CHECK (outcome IN (
                          'pending', 'responded', 'ignored', 'recovered'
                        ))
);

CREATE TABLE IF NOT EXISTS payment_links (
  id                  TEXT PRIMARY KEY,             -- uuid
  case_id             TEXT NOT NULL REFERENCES cases(id),
  razorpay_link_id    TEXT,
  short_url           TEXT,
  status              TEXT NOT NULL DEFAULT 'created' CHECK (status IN (
                          'created', 'paid', 'expired'
                        )),
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stopping_rule_log (
  id                  TEXT PRIMARY KEY,             -- uuid
  case_id             TEXT NOT NULL REFERENCES cases(id),
  reason              TEXT NOT NULL CHECK (reason IN (
                          'max_attempts_reached', 'risk_blocked', 'contact_window_violated', 'manual_override'
                        )),
  detail              TEXT,                          -- plain-language explanation for audit trail
  triggered_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_root_cause ON cases(root_cause);
CREATE INDEX IF NOT EXISTS idx_actions_case_id ON actions(case_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_case_id ON payment_links(case_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_razorpay_link_id ON payment_links(razorpay_link_id);
CREATE INDEX IF NOT EXISTS idx_stopping_rule_log_case_id ON stopping_rule_log(case_id);

-- Runtime-adjustable settings (stretch screen 6: max attempts / contact
-- window). Falls back to .env defaults when a key isn't present here —
-- see configService.js.
CREATE TABLE IF NOT EXISTS settings (
  key                 TEXT PRIMARY KEY,
  value                TEXT NOT NULL,
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);