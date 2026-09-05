import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { formatRupees, formatPercent } from '../lib/format';
import RadarHero from '../components/RadarHero';
import StatCard from '../components/StatCard';
import RootCauseBreakdown from '../components/RootCauseBreakdown';

const POLL_INTERVAL_MS = 4000;

export default function Dashboard() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();

  const [metrics, setMetrics] = useState(null);
  const [cases, setCases] = useState([]);
  const [batchSize, setBatchSize] = useState(40);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [lastRunSummary, setLastRunSummary] = useState(null);
  const [streamProgress, setStreamProgress] = useState(null); // { processed, total }

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const [metricsData, casesData] = await Promise.all([
        api.getMetrics(token),
        api.getCases(token, { limit: 200 }),
      ]);
      setMetrics(metricsData);
      setCases(casesData.cases);
      setError(null);
    } catch (err) {
      if (err.status === 401) {
        logout();
        navigate('/login');
        return;
      }
      setError(err.message);
    }
  }, [token, logout, navigate]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  async function handleRunBatch() {
    setRunning(true);
    setError(null);
    setStreamProgress({ processed: 0, total: batchSize });
    const byRootCause = {};
    let stored = 0;

    try {
      await api.streamBatch(
        token,
        batchSize,
        async (result) => {
          if (result.done) {
            setLastRunSummary({ stored: result.stored, byRootCause });
            return;
          }
          if (result.ok) {
            stored += 1;
            if (result.rootCause) byRootCause[result.rootCause] = (byRootCause[result.rootCause] || 0) + 1;
          }
          setStreamProgress((prev) => ({ processed: (prev?.processed || 0) + 1, total: batchSize }));
          // Refresh from the DB after every event so the radar/stat cards
          // reflect exactly what's persisted — no client-side state to
          // drift out of sync with recovery matching, stopping rules, etc.
          await refresh();
        },
        { pacingMs: 150 }
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
      setStreamProgress(null);
    }
  }

  async function handleClearDemoData() {
    if (!token) return;
    try {
      setRunning(true);
      await api.clearDemoData(token, 'demo');
      setLastRunSummary(null);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const totalAtRisk = metrics?.totalAtRisk ?? { amount: 0, count: 0 };
  const totalRecovered = metrics?.totalRecovered ?? { amount: 0, count: 0 };
  const recoveryRate = metrics?.recoveryRate ?? 0;

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 md:py-8 max-w-6xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div>
          <div className="inline-flex items-center gap-2 text-scan font-mono text-xs uppercase tracking-[0.25em] mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-scan animate-blipPulse" />
            Recovery Copilot
          </div>
          <h1 className="font-display text-2xl font-semibold text-ink">Revenue Radar</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/cases"
            className="text-sm text-ink-muted hover:text-ink border border-void-grid rounded-md px-3 py-1.5 transition-colors"
          >
            View cases
          </Link>
          <Link
            to="/settings"
            className="text-sm text-ink-muted hover:text-ink border border-void-grid rounded-md px-3 py-1.5 transition-colors"
          >
            Settings
          </Link>
          <button
            onClick={handleLogout}
            className="text-sm text-ink-muted hover:text-ink border border-void-grid rounded-md px-3 py-1.5 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-6 text-sm text-stopped bg-stopped/10 border border-stopped/30 rounded-md px-4 py-2.5">
          {error}
        </div>
      )}

      {/* Hero: radar scope */}
      <div className="flex flex-col items-center bg-void-panel border border-void-grid rounded-xl py-8 mb-6 shadow-panel">
        <RadarHero
          cases={cases}
          totalAtRiskAmount={totalAtRisk.amount}
          totalAtRiskCount={totalAtRisk.count}
        />

        {/* Batch replay control (FR-22) */}
        <div className="mt-6 flex items-center gap-3 flex-wrap justify-center">
          <label className="text-xs text-ink-muted font-mono uppercase tracking-wider" htmlFor="batchSize">
            Batch size
          </label>
          <input
            id="batchSize"
            type="number"
            min="1"
            max="200"
            value={batchSize}
            onChange={(e) => setBatchSize(Number(e.target.value))}
            className="w-20 rounded-md bg-void border border-void-grid px-2 py-1.5 text-sm text-ink font-mono focus:border-scan outline-none"
          />
          <button
            onClick={handleRunBatch}
            disabled={running}
            className="rounded-md bg-scan text-void font-semibold px-4 py-1.5 text-sm hover:bg-scan/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {running ? 'Running scan…' : 'Run batch replay'}
          </button>
          <button
            onClick={handleClearDemoData}
            disabled={running}
            className="rounded-md border border-void-grid text-ink-muted hover:text-ink font-semibold px-4 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Clear demo data
          </button>
        </div>

        {running && streamProgress && (
          <div className="mt-4 w-64">
            <div className="flex justify-between text-xs font-mono text-ink-faint mb-1">
              <span>{streamProgress.processed} / {streamProgress.total} events</span>
              <span>{Math.round((streamProgress.processed / streamProgress.total) * 100)}%</span>
            </div>
            <div className="h-1.5 bg-void-grid rounded-full overflow-hidden">
              <div
                className="h-full bg-scan transition-all duration-150"
                style={{ width: `${(streamProgress.processed / streamProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {lastRunSummary && (
          <p className="mt-3 text-xs text-ink-faint font-mono">
            Last run: {lastRunSummary.stored} events stored ·{' '}
            {Object.entries(lastRunSummary.byRootCause || {}).map(([k, v]) => `${k}:${v}`).join('  ')}
          </p>
        )}
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="₹ at risk"
          value={formatRupees(totalAtRisk.amount)}
          sublabel={`${totalAtRisk.count} open case${totalAtRisk.count === 1 ? '' : 's'}`}
          accentClass="text-risk"
        />
        <StatCard
          label="₹ recovered"
          value={formatRupees(totalRecovered.amount)}
          sublabel={`${totalRecovered.count} case${totalRecovered.count === 1 ? '' : 's'} won back`}
          accentClass="text-recovered"
        />
        <StatCard
          label="Recovery rate"
          value={formatPercent(recoveryRate)}
          sublabel="of resolved cases"
          accentClass="text-scan"
        />
      </div>

      {/* Root cause breakdown */}
      <section>
        <h2 className="text-xs uppercase tracking-[0.15em] text-ink-muted font-mono mb-3">Breakdown by root cause</h2>
        <RootCauseBreakdown breakdown={metrics?.breakdownByRootCause} />
      </section>
    </div>
  );
}