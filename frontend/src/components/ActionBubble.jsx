import { formatDateTime } from '../lib/format';

const CHANNEL_META = {
  email_sim: { label: 'Email', icon: '✉️', bubbleClass: 'bg-void border border-void-grid' },
  whatsapp_sim: { label: 'WhatsApp-style', icon: '💬', bubbleClass: 'bg-recovered/10 border border-recovered/30' },
  voice_sim: { label: 'Voice-style', icon: '📞', bubbleClass: 'bg-scan/10 border border-scan/30' },
  auto_retry: { label: 'Automatic retry', icon: '↻', bubbleClass: 'bg-void border border-void-grid' },
};

export default function ActionBubble({ action }) {
  const meta = CHANNEL_META[action.channel] || CHANNEL_META.email_sim;
  const [subject, ...bodyParts] = (action.message_content || '').split('\n\n');
  const hasSubject = action.channel === 'email_sim' && bodyParts.length > 0;
  const isRealChannel = action.channel === 'email_sim' || action.channel === 'whatsapp_sim';
  const isReal = isRealChannel && Number(action.delivered_real) === 1;
  const realLabel = action.channel === 'email_sim' ? 'real email — actually sent' : 'real WhatsApp — actually sent';

  return (
    <div className="relative">
      {action.channel !== 'auto_retry' && (
        <div
          className={`absolute -top-2 right-3 text-[10px] font-mono uppercase tracking-wider px-1.5 bg-void-panel ${
            isReal ? 'text-recovered' : 'text-ink-faint'
          }`}
        >
          {isReal ? realLabel : 'simulated — not actually sent'}
        </div>
      )}
      <div className={`rounded-lg px-4 py-3 ${meta.bubbleClass}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono uppercase tracking-wider text-ink-muted">
            {meta.icon} {meta.label}
          </span>
          <span className="text-xs font-mono text-ink-faint">{formatDateTime(action.sent_at)}</span>
        </div>
        {hasSubject && <div className="text-sm font-medium text-ink mb-1">{subject}</div>}
        <div className="text-sm text-ink-muted whitespace-pre-line">
          {hasSubject ? bodyParts.join('\n\n') : action.message_content}
        </div>
        <div className="mt-2 text-xs font-mono text-ink-faint">outcome: {action.outcome}</div>
      </div>
    </div>
  );
}