import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { formatRupees, formatDateTime, rootCauseLabel } from '../lib/format';
import { StatusBadge, RootCauseBadge } from '../components/Badges';
import ActionBubble from '../components/ActionBubble';

export default function CaseDetail() {
  const { id } = useParams();
  const { token, logout } = useAuth();
  const navigate = useNavigate();

  const [caseData, setCaseData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getCase(token, id);
      setCaseData(data);
      setError(null);
    } catch (err) {
      if (err.status === 401) {
        logout();
        navigate('/login');
        return;
      }
      setError(err.message);
    }
  }, [token, id, logout, navigate]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleTriggerAction() {
    setBusy(true);
    try {
      await api.triggerAction(token, id);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleStop() {
    const reason = window.prompt('Reason for stopping this case (optional):', 'Stopped manually by merchant.');
    if (reason === null) return; // cancelled
    setBusy(true);
    try {
      await api.stopCase(token, id, reason);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !caseData) {
    return (
      <div className="min-h-screen px-4 py-8 max-w-3xl mx-auto">
        <Link to="/cases" className="text-xs text-scan font-mono uppercase tracking-wider hover:underline">
          ← Cases
        </Link>
        <div className="mt-4 text-sm text-stopped bg-stopped/10 border border-stopped/30 rounded-md px-4 py-2.5">
          {error}
        </div>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="min-h-screen px-4 py-8 max-w-3xl mx-auto text-ink-muted text-sm font-mono">Loading…</div>
    );
  }

  const isTerminal = caseData.status === 'recovered' || caseData.status === 'stopped';

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 md:py-8 max-w-3xl mx-auto">
      <Link to="/cases" className="text-xs text-scan font-mono uppercase tracking-wider hover:underline">
        ← Cases
      </Link>

      {/* Header */}
      <div className="mt-3 mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{caseData.customer_ref}</h1>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge status={caseData.status} />
            <RootCauseBadge rootCause={caseData.root_cause} />
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-mono font-semibold text-ink" data-numeric>
            {formatRupees(caseData.amount)}
          </div>
          <div className="text-xs text-ink-faint font-mono mt-1">
            {caseData.attempts_made}/{caseData.max_attempts} attempts
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-stopped bg-stopped/10 border border-stopped/30 rounded-md px-4 py-2.5">
          {error}
        </div>
      )}

      {/* Explainer panel — classification reasoning (FR-6) */}
      <section className="mb-6 bg-void-panel border border-void-grid rounded-lg p-4 shadow-panel">
        <h2 className="text-xs uppercase tracking-[0.15em] text-ink-muted font-mono mb-2">Why this classification</h2>
        <p className="text-sm text-ink leading-relaxed">{caseData.root_cause_reason}</p>
        <p className="mt-2 text-xs text-ink-faint font-mono">
          Playbook: <span className="text-scan">{caseData.playbook}</span>
        </p>
      </section>

      {/* Manual override controls */}
      {!isTerminal && (
        <section className="mb-6 flex gap-3">
          <button
            onClick={handleTriggerAction}
            disabled={busy}
            className="rounded-md bg-scan text-void font-semibold px-4 py-2 text-sm hover:bg-scan/90 disabled:opacity-50 transition-colors"
          >
            {busy ? 'Working…' : 'Trigger next action now'}
          </button>
          <button
            onClick={handleStop}
            disabled={busy}
            className="rounded-md border border-stopped/40 text-stopped font-semibold px-4 py-2 text-sm hover:bg-stopped/10 disabled:opacity-50 transition-colors"
          >
            Stop case
          </button>
        </section>
      )}

      {/* Audit trail: event -> actions -> payment links -> stopping rules */}
      <section className="mb-6">
        <h2 className="text-xs uppercase tracking-[0.15em] text-ink-muted font-mono mb-3">
          Audit trail — actions taken
        </h2>
        {caseData.actions.length === 0 ? (
          <p className="text-sm text-ink-faint font-mono">No actions taken yet.</p>
        ) : (
          <div className="space-y-3">
            {caseData.actions.map((a) => (
              <ActionBubble key={a.id} action={a} />
            ))}
          </div>
        )}
      </section>

      {caseData.paymentLinks.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs uppercase tracking-[0.15em] text-ink-muted font-mono mb-3">Payment links generated</h2>
          <div className="space-y-2">
            {caseData.paymentLinks.map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-void-panel border border-void-grid rounded-md px-4 py-2.5 text-sm">
                <div className="flex items-center gap-2 overflow-hidden">
                  <a
                    href={p.short_url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-scan truncate hover:underline"
                  >
                    {p.short_url}
                  </a>
                  {p.short_url && p.short_url.includes('sim_') && (
                    <span className="text-[10px] font-mono text-ink-faint bg-void px-1.5 py-0.5 rounded border border-void-grid whitespace-nowrap">
                      simulated
                    </span>
                  )}
                </div>
                <span className="text-xs font-mono text-ink-faint uppercase ml-2">{p.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {caseData.stoppingRuleLog.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs uppercase tracking-[0.15em] text-ink-muted font-mono mb-3">Stopping-rule triggers</h2>
          <div className="space-y-2">
            {caseData.stoppingRuleLog.map((s) => (
              <div key={s.id} className="bg-stopped/10 border border-stopped/30 rounded-md px-4 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-mono text-stopped">{s.reason.replace(/_/g, ' ')}</span>
                  <span className="text-xs font-mono text-ink-faint">{formatDateTime(s.triggered_at)}</span>
                </div>
                {s.detail && <p className="mt-1 text-xs text-ink-muted">{s.detail}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {caseData.sourceEvent && (
        <section>
          <h2 className="text-xs uppercase tracking-[0.15em] text-ink-muted font-mono mb-3">Source event</h2>
          <div className="bg-void-panel border border-void-grid rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-mono text-ink">{caseData.sourceEvent.type}</span>
              <span className="text-xs font-mono text-ink-faint">{formatDateTime(caseData.sourceEvent.received_at)}</span>
            </div>
            <pre className="text-xs text-ink-faint font-mono overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(caseData.sourceEvent.payload, null, 2)}
            </pre>
          </div>
        </section>
      )}
    </div>
  );
}