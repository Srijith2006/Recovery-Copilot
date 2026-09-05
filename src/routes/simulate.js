const express = require('express');
const db = require('../db/connection');
const { generateBatch } = require('../generators/syntheticEvents');
const { recordEvent } = require('../services/eventService');
const { createCaseFromEvent, markRecoveredIfMatch } = require('../services/caseService');
const { executeNextStep } = require('../services/playbookService');

const router = express.Router();

function resolveSize(req) {
  const requestedSize = Number(req.body && req.body.size);
  return Number.isFinite(requestedSize) && requestedSize > 0 ? Math.min(requestedSize, 200) : 40;
}

/** Runs the full ingestion -> classification -> playbook pipeline for one
 * synthetic event, exactly as /webhooks/razorpay would for a real one. */
async function processOne(rawEvent) {
  const { event, duplicate } = recordEvent(rawEvent);
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
  return {
    eventId: event.id,
    type: event.type,
    duplicate,
    ok: true,
    caseId: caseCreated ? caseCreated.id : null,
    rootCause: caseCreated ? caseCreated.root_cause : null,
    classificationMethod: caseCreated ? caseCreated.classificationMethod : null,
    recoveredCaseId: recoveryMatch ? recoveryMatch.caseId : null,
    playbookAction: playbookResult ? playbookResult.action : null,
  };
}

// Triggers a synthetic batch replay. Bypasses signature verification
// deliberately — these events never touch the /webhooks/razorpay route,
// they're injected straight into the same event-store + classification
// path so we can exercise the full pipeline without live Razorpay traffic.
//
// This variant processes the whole batch before responding — good for
// fast seeding of test data, but the dashboard only sees a single
// before/after jump. For a demo where the dashboard should visibly tick
// up as replay runs, use POST /simulate/batch/stream instead.
router.post('/batch', async (req, res) => {
  const size = resolveSize(req);
  const batch = generateBatch(size);

  const results = [];
  for (const rawEvent of batch) {
    try {
      results.push(await processOne(rawEvent));
    } catch (err) {
      results.push({ ok: false, error: err.message });
    }
  }

  const summary = results.reduce(
    (acc, r) => {
      if (r.ok) {
        acc.stored += 1;
        acc.byType[r.type] = (acc.byType[r.type] || 0) + 1;
        if (r.rootCause) acc.byRootCause[r.rootCause] = (acc.byRootCause[r.rootCause] || 0) + 1;
      } else {
        acc.failed += 1;
      }
      return acc;
    },
    { stored: 0, failed: 0, byType: {}, byRootCause: {} }
  );

  res.status(201).json({ requested: size, summary, results });
});

// Streaming variant (FR-22: "watch the dashboard update live"). Writes one
// newline-delimited JSON result per processed event as it happens, with a
// small pacing delay between each, so the frontend can animate the radar
// and stat counters ticking up in real time instead of jumping once at
// the end. NFR performance target ("reflect within a few seconds each")
// is what the delay is tuned around, not a hard requirement.
router.post('/batch/stream', async (req, res) => {
  const size = resolveSize(req);
  const pacingMs = Math.min(Math.max(Number(req.body && req.body.pacingMs) || 150, 0), 2000);
  const batch = generateBatch(size);

  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson',
    'Cache-Control': 'no-cache',
    'Transfer-Encoding': 'chunked',
    'X-Accel-Buffering': 'no', // disable proxy buffering if this ever sits behind nginx
  });

  let stored = 0;
  let failed = 0;

  for (const rawEvent of batch) {
    let result;
    try {
      result = await processOne(rawEvent);
      stored += 1;
    } catch (err) {
      result = { ok: false, error: err.message };
      failed += 1;
    }
    res.write(JSON.stringify(result) + '\n');
    if (pacingMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, pacingMs));
    }
  }

  res.write(JSON.stringify({ done: true, requested: size, stored, failed }) + '\n');
  res.end();
});

// Clears synthetic demo data (or all data if mode === 'all') so merchants can
// test live webhook integrations with a clean dashboard.
router.post('/clear', (req, res) => {
  const mode = req.body && req.body.mode;
  try {
    if (mode === 'all') {
      db.exec('DELETE FROM payment_links');
      db.exec('DELETE FROM actions');
      db.exec('DELETE FROM stopping_rule_log');
      db.exec('DELETE FROM cases');
      db.exec('DELETE FROM events');
      return res.json({ ok: true, cleared: 'all' });
    }

    db.exec(`
      DELETE FROM payment_links WHERE case_id IN (
        SELECT id FROM cases WHERE customer_ref LIKE 'demo.customer%' OR event_id IN (SELECT id FROM events WHERE razorpay_event_id LIKE 'evt_synth%')
      )
    `);
    db.exec(`
      DELETE FROM actions WHERE case_id IN (
        SELECT id FROM cases WHERE customer_ref LIKE 'demo.customer%' OR event_id IN (SELECT id FROM events WHERE razorpay_event_id LIKE 'evt_synth%')
      )
    `);
    db.exec(`
      DELETE FROM stopping_rule_log WHERE case_id IN (
        SELECT id FROM cases WHERE customer_ref LIKE 'demo.customer%' OR event_id IN (SELECT id FROM events WHERE razorpay_event_id LIKE 'evt_synth%')
      )
    `);
    db.exec(`
      DELETE FROM cases WHERE customer_ref LIKE 'demo.customer%' OR event_id IN (SELECT id FROM events WHERE razorpay_event_id LIKE 'evt_synth%')
    `);
    db.exec(`
      DELETE FROM events WHERE razorpay_event_id LIKE 'evt_synth%' OR payload LIKE '%demo.customer%'
    `);

    return res.json({ ok: true, cleared: 'demo' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;