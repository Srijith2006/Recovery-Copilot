import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

export default function Settings() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();

  const [maxAttempts, setMaxAttempts] = useState(3);
  const [contactWindowHours, setContactWindowHours] = useState(24);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const s = await api.getSettings(token);
      setMaxAttempts(s.max_attempts);
      setContactWindowHours(s.contact_window_hours);
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

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await api.updateSettings(token, {
        max_attempts: Number(maxAttempts),
        contact_window_hours: Number(contactWindowHours),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 md:py-8 max-w-lg mx-auto">
      <Link to="/dashboard" className="text-xs text-scan font-mono uppercase tracking-wider hover:underline">
        ← Revenue Radar
      </Link>
      <h1 className="font-display text-2xl font-semibold text-ink mt-3 mb-1">Settings</h1>
      <p className="text-sm text-ink-muted mb-6">
        These control the stopping rules every case is checked against (FR-12, FR-13). Changes apply immediately to new and in-flight cases.
      </p>

      {loading ? (
        <p className="text-sm text-ink-muted font-mono">Loading…</p>
      ) : (
        <form onSubmit={handleSave} className="bg-void-panel border border-void-grid rounded-lg p-6 shadow-panel space-y-5">
          <div>
            <label htmlFor="maxAttempts" className="block text-xs uppercase tracking-wider text-ink-muted font-mono mb-1.5">
              Max recovery attempts
            </label>
            <input
              id="maxAttempts"
              type="number"
              min="1"
              max="10"
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(e.target.value)}
              className="w-full rounded-md bg-void border border-void-grid px-3 py-2 text-ink font-mono focus:border-scan outline-none transition-colors"
            />
            <p className="mt-1 text-xs text-ink-faint">A case stops automatically once it hits this many attempts (1–10).</p>
          </div>

          <div>
            <label htmlFor="contactWindow" className="block text-xs uppercase tracking-wider text-ink-muted font-mono mb-1.5">
              Contact window (hours)
            </label>
            <input
              id="contactWindow"
              type="number"
              min="1"
              max="168"
              value={contactWindowHours}
              onChange={(e) => setContactWindowHours(e.target.value)}
              className="w-full rounded-md bg-void border border-void-grid px-3 py-2 text-ink font-mono focus:border-scan outline-none transition-colors"
            />
            <p className="mt-1 text-xs text-ink-faint">Minimum time between contacting the same customer again (1–168h).</p>
          </div>

          {error && (
            <div className="text-sm text-stopped bg-stopped/10 border border-stopped/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          {saved && (
            <div className="text-sm text-recovered bg-recovered/10 border border-recovered/30 rounded-md px-3 py-2">
              Settings saved.
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-md bg-scan text-void font-semibold py-2.5 hover:bg-scan/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </form>
      )}
    </div>
  );
}