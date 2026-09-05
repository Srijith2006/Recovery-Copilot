import { formatRupees, rootCauseLabel } from '../lib/format';

const ORDER = ['insufficient_funds', 'card_expired', 'bank_timeout', 'mandate_lapsed', 'risk_block', 'checkout_abandoned', 'unclassified'];

export default function RootCauseBreakdown({ breakdown = {} }) {
  const entries = ORDER
    .filter((cause) => breakdown[cause])
    .map((cause) => [cause, breakdown[cause]]);

  if (entries.length === 0) {
    return (
      <div className="bg-void-panel border border-void-grid rounded-lg px-5 py-8 text-center text-ink-muted text-sm font-mono">
        No cases yet — run a batch replay to populate the radar.
      </div>
    );
  }

  return (
    <div className="bg-void-panel border border-void-grid rounded-lg overflow-hidden shadow-panel">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-void-grid text-left text-xs uppercase tracking-wider text-ink-muted font-mono">
            <th className="px-4 py-3 font-medium">Root cause</th>
            <th className="px-4 py-3 font-medium text-right">At risk</th>
            <th className="px-4 py-3 font-medium text-right">Recovered</th>
            <th className="px-4 py-3 font-medium text-right">Stopped</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([cause, stats]) => (
            <tr key={cause} className="border-b border-void-grid last:border-0">
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-2">
                  <span className="text-ink">{rootCauseLabel(cause)}</span>
                </span>
              </td>
              <td className="px-4 py-3 text-right font-mono text-risk" data-numeric>
                {stats.atRiskCount > 0 ? `${formatRupees(stats.atRiskAmount)} · ${stats.atRiskCount}` : '—'}
              </td>
              <td className="px-4 py-3 text-right font-mono text-recovered" data-numeric>
                {stats.recoveredCount > 0 ? `${formatRupees(stats.recoveredAmount)} · ${stats.recoveredCount}` : '—'}
              </td>
              <td className="px-4 py-3 text-right font-mono text-stopped" data-numeric>
                {stats.stoppedCount > 0 ? `${formatRupees(stats.stoppedAmount)} · ${stats.stoppedCount}` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}