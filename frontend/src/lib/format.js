export function formatRupees(amountPaise) {
  const rupees = (amountPaise || 0) / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(rupees);
}

export function formatPercent(fraction) {
  return `${Math.round((fraction || 0) * 100)}%`;
}

export function rootCauseLabel(rootCause) {
  const labels = {
    insufficient_funds: 'Insufficient funds',
    card_expired: 'Card expired',
    bank_timeout: 'Bank timeout',
    mandate_lapsed: 'Mandate lapsed',
    risk_block: 'Risk blocked',
    checkout_abandoned: 'Checkout abandoned',
    unclassified: 'Unclassified',
  };
  return labels[rootCause] || rootCause;
}

export function formatDateTime(sqliteTs) {
  if (!sqliteTs) return '—';
  const d = new Date(sqliteTs.replace(' ', 'T') + 'Z');
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatRelativeTime(sqliteTs) {
  if (!sqliteTs) return '—';
  const d = new Date(sqliteTs.replace(' ', 'T') + 'Z');
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/** Simple deterministic string hash -> [0,1), used for stable blip placement. */
export function hashToUnit(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return (Math.abs(hash) % 10000) / 10000;
}