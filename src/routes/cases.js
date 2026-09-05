const express = require('express');
const db = require('../db/connection');

const router = express.Router();

const listStmt = db.prepare(`SELECT * FROM cases ORDER BY created_at DESC LIMIT ?`);
const getStmt = db.prepare(`SELECT * FROM cases WHERE id = ?`);
const getActionsStmt = db.prepare(`SELECT * FROM actions WHERE case_id = ? ORDER BY sent_at ASC`);
const getPaymentLinksStmt = db.prepare(`SELECT * FROM payment_links WHERE case_id = ? ORDER BY created_at ASC`);
const getStoppingLogStmt = db.prepare(`SELECT * FROM stopping_rule_log WHERE case_id = ? ORDER BY triggered_at ASC`);
const getEventStmt = db.prepare(`SELECT * FROM events WHERE id = ?`);

router.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const rows = listStmt.all(limit);
  res.json({ count: rows.length, cases: rows });
});

router.get('/:id', (req, res) => {
  const caseRow = getStmt.get(req.params.id);
  if (!caseRow) return res.status(404).json({ error: 'Case not found' });

  // Full audit trail (FR-21): event -> classification (already on the case
  // row) -> actions taken -> payment links -> stopping-rule triggers.
  const sourceEvent = getEventStmt.get(caseRow.event_id);
  res.json({
    ...caseRow,
    sourceEvent: sourceEvent ? { ...sourceEvent, payload: JSON.parse(sourceEvent.payload) } : null,
    actions: getActionsStmt.all(caseRow.id),
    paymentLinks: getPaymentLinksStmt.all(caseRow.id),
    stoppingRuleLog: getStoppingLogStmt.all(caseRow.id),
  });
});

module.exports = router;