export default function StatCard({ label, value, sublabel, accentClass = 'text-ink' }) {
  return (
    <div className="bg-void-panel border border-void-grid rounded-lg px-5 py-4 shadow-panel">
      <div className="text-xs uppercase tracking-[0.15em] text-ink-muted font-mono">{label}</div>
      <div className={`mt-2 text-2xl font-mono font-semibold ${accentClass}`} data-numeric>
        {value}
      </div>
      {sublabel && <div className="mt-1 text-xs text-ink-faint font-mono">{sublabel}</div>}
    </div>
  );
}