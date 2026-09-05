import { rootCauseLabel } from '../lib/format';

const STATUS_STYLES = {
  open: 'text-risk border-risk/40 bg-risk/10',
  in_progress: 'text-scan border-scan/40 bg-scan/10',
  recovered: 'text-recovered border-recovered/40 bg-recovered/10',
  stopped: 'text-stopped border-stopped/40 bg-stopped/10',
};

const STATUS_LABEL = {
  open: 'Open',
  in_progress: 'In progress',
  recovered: 'Recovered',
  stopped: 'Stopped',
};

export function StatusBadge({ status }) {
  const cls = STATUS_STYLES[status] || STATUS_STYLES.open;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-mono ${cls}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export function RootCauseBadge({ rootCause }) {
  return (
    <span className="inline-flex items-center rounded-full border border-void-grid bg-void px-2.5 py-0.5 text-xs text-ink-muted font-mono">
      {rootCauseLabel(rootCause)}
    </span>
  );
}