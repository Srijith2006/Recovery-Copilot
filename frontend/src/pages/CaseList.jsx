import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { formatRupees, formatRelativeTime } from '../lib/format';
import { StatusBadge, RootCauseBadge } from '../components/Badges';

const STATUS_OPTIONS = ['all', 'open', 'in_progress', 'recovered', 'stopped'];
const ROOT_CAUSE_OPTIONS = [
  'all',
  'insufficient_funds',
  'card_expired',
  'bank_timeout',
  'mandate_lapsed',
  'risk_block',
  'checkout_abandoned',
  'unclassified',
];

export default function CaseList() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();

  const [cases, setCases] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [rootCauseFilter, setRootCauseFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api.getCases(token, { limit: 300 });
      setCases(data.cases);
      setError(null);
    } catch (err) {
      if (err.status === 401) {
        logout();
        navigate('/login');
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, logout, navigate]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = cases.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (rootCauseFilter !== 'all' && c.root_cause !== rootCauseFilter) return false;
    return true;
  });

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 md:py-8 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div>
          <Link to="/dashboard" className="text-xs text-scan font-mono uppercase tracking-wider hover:underline">
            ← Revenue Radar
          </Link>
          <h1 className="font-display text-2xl font-semibold text-ink mt-1">Cases</h1>
        </div>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-5">
        <FilterGroup label="Status" options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} />
        <FilterGroup label="Root cause" options={ROOT_CAUSE_OPTIONS} value={rootCauseFilter} onChange={setRootCauseFilter} />
      </div>

      {error && (
        <div className="mb-4 text-sm text-stopped bg-stopped/10 border border-stopped/30 rounded-md px-4 py-2.5">
          {error}
        </div>
      )}

      <div className="bg-void-panel border border-void-grid rounded-lg overflow-hidden shadow-panel">
        {loading ? (
          <div className="px-4 py-8 text-center text-ink-muted text-sm font-mono">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-ink-muted text-sm font-mono">No cases match these filters.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-void-grid text-left text-xs uppercase tracking-wider text-ink-muted font-mono">
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Root cause</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
                <th className="px-4 py-3 font-medium text-right">Attempts</th>
                <th className="px-4 py-3 font-medium text-right">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/cases/${c.id}`)}
                  className="border-b border-void-grid last:border-0 hover:bg-void cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 text-ink truncate max-w-[200px]">{c.customer_ref}</td>
                  <td className="px-4 py-3">
                    <RootCauseBadge rootCause={c.root_cause} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-ink" data-numeric>
                    {formatRupees(c.amount)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-ink-muted" data-numeric>
                    {c.attempts_made}/{c.max_attempts}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-ink-faint text-xs">
                    {formatRelativeTime(c.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FilterGroup({ label, options, value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-ink-muted font-mono uppercase tracking-wider">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md bg-void-panel border border-void-grid px-2.5 py-1.5 text-sm text-ink font-mono focus:border-scan outline-none"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt === 'all' ? 'All' : opt.replace(/_/g, ' ')}
          </option>
        ))}
      </select>
    </div>
  );
}