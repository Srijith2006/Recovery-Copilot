const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db/connection');
const { executeNextStep } = require('../services/playbookService');

const router = express.Router();

const getCaseStmt = db.prepare(`SELECT * FROM cases WHERE id = ?`);
const updateCaseStatusStmt = db.prepare(`UPDATE cases SET status = ?, updated_at = datetime('now') WHERE id = ?`);
const insertStoppingLogStmt = db.prepare(`
  INSERT INTO stopping_rule_log (id, case_id, reason, detail)
  VALUES (@id, @case_id, @reason, @detail)
`);

// POST /cases/:id/action — manually trigger the next playbook step
// (demo control / merchant override to force a retry now).
router.post('/:id/action', async (req, res) => {
  const caseRow = getCaseStmt.get(req.params.id);
  if (!caseRow) return res.status(404).json({ error: 'Case not found' });

  const result = await executeNextStep(caseRow.id);
  res.json(result);
});

// POST /cases/:id/stop — manual merchant override to stop a case outright.
router.post('/:id/stop', (req, res) => {
  const caseRow = getCaseStmt.get(req.params.id);
  if (!caseRow) return res.status(404).json({ error: 'Case not found' });

  if (caseRow.status === 'stopped' || caseRow.status === 'recovered') {
    return res.status(409).json({ error: `Case already in terminal status: ${caseRow.status}` });
  }

  const detail = (req.body && req.body.reason) || 'Stopped manually by merchant.';
  updateCaseStatusStmt.run('stopped', caseRow.id);
  insertStoppingLogStmt.run({ id: randomUUID(), case_id: caseRow.id, reason: 'manual_override', detail });

  res.json({ ok: true, caseId: caseRow.id, status: 'stopped', reason: 'manual_override', detail });
});

module.exports = router;