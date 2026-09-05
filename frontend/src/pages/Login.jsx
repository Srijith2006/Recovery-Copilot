import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 text-scan font-mono text-xs uppercase tracking-[0.25em] mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-scan animate-blipPulse" />
            Recovery Copilot
          </div>
          <h1 className="font-display text-3xl font-semibold text-ink">Revenue Radar</h1>
          <p className="mt-2 text-sm text-ink-muted">Sign in to monitor recovery in real time.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-void-panel border border-void-grid rounded-lg p-6 shadow-panel space-y-4">
          <div>
            <label htmlFor="username" className="block text-xs uppercase tracking-wider text-ink-muted font-mono mb-1.5">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-md bg-void border border-void-grid px-3 py-2 text-ink placeholder:text-ink-faint focus:border-scan outline-none transition-colors"
              placeholder="merchant"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs uppercase tracking-wider text-ink-muted font-mono mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md bg-void border border-void-grid px-3 py-2 text-ink placeholder:text-ink-faint focus:border-scan outline-none transition-colors"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="text-sm text-stopped bg-stopped/10 border border-stopped/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-scan text-void font-semibold py-2.5 hover:bg-scan/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}