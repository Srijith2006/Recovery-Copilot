const db = require('../db/connection');

// At-risk = anything still actively being worked (open or in_progress).
// Recovered = successfully captured. Stopped = gave up (max attempts /
// risk block / manual override) — tracked separately so it's not silently
// folded into either "at risk" or "recovered".
const totalsByStatusStmt = db.prepare(`
  SELECT status, COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount
  FROM cases
  GROUP BY status
`);

const breakdownByRootCauseStmt = db.prepare(`
  SELECT
    root_cause,
    status,
    COUNT(*) as count,
    COALESCE(SUM(amount), 0) as total_amount
  FROM cases
  GROUP BY root_cause, status
`);

const stoppingReasonBreakdownStmt = db.prepare(`
  SELECT reason, COUNT(*) as count
  FROM stopping_rule_log
  GROUP BY reason
`);

/**
 * Computes dashboard metrics straight from case data (FR-19) — nothing
 * here is hardcoded or cached separately from the source tables, per the
 * PRD's "no fabricated numbers" acceptance criterion.
 */
function computeMetrics() {
  const statusRows = totalsByStatusStmt.all();
  const byStatus = { open: { count: 0, amount: 0 }, in_progress: { count: 0, amount: 0 }, recovered: { count: 0, amount: 0 }, stopped: { count: 0, amount: 0 } };
  for (const row of statusRows) {
    byStatus[row.status] = { count: row.count, amount: row.total_amount };
  }

  const totalAtRiskAmount = byStatus.open.amount + byStatus.in_progress.amount;
  const totalAtRiskCount = byStatus.open.count + byStatus.in_progress.count;
  const totalRecoveredAmount = byStatus.recovered.amount;
  const totalRecoveredCount = byStatus.recovered.count;
  const totalStoppedAmount = byStatus.stopped.amount;
  const totalStoppedCount = byStatus.stopped.count;

  const totalResolvableCases = totalRecoveredCount + totalStoppedCount; // cases that reached a terminal state
  // Recovery rate is computed over cases that have *resolved* (recovered or
  // stopped) — open/in_progress cases haven't had their chance yet, so
  // including them would understate the rate misleadingly.
  const recoveryRate = totalResolvableCases > 0 ? totalRecoveredCount / totalResolvableCases : 0;

  const rootCauseRows = breakdownByRootCauseStmt.all();
  const breakdownByRootCause = {};
  for (const row of rootCauseRows) {
    if (!breakdownByRootCause[row.root_cause]) {
      breakdownByRootCause[row.root_cause] = {
        atRiskCount: 0, atRiskAmount: 0,
        recoveredCount: 0, recoveredAmount: 0,
        stoppedCount: 0, stoppedAmount: 0,
      };
    }
    const bucket = breakdownByRootCause[row.root_cause];
    if (row.status === 'open' || row.status === 'in_progress') {
      bucket.atRiskCount += row.count;
      bucket.atRiskAmount += row.total_amount;
    } else if (row.status === 'recovered') {
      bucket.recoveredCount += row.count;
      bucket.recoveredAmount += row.total_amount;
    } else if (row.status === 'stopped') {
      bucket.stoppedCount += row.count;
      bucket.stoppedAmount += row.total_amount;
    }
  }

  const stoppingReasons = {};
  for (const row of stoppingReasonBreakdownStmt.all()) {
    stoppingReasons[row.reason] = row.count;
  }

  return {
    totalAtRisk: { amount: totalAtRiskAmount, count: totalAtRiskCount },
    totalRecovered: { amount: totalRecoveredAmount, count: totalRecoveredCount },
    totalStopped: { amount: totalStoppedAmount, count: totalStoppedCount },
    recoveryRate, // 0..1, over resolved cases
    breakdownByRootCause,
    stoppingReasons,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { computeMetrics };