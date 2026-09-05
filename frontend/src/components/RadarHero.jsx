import { formatRupees, hashToUnit } from '../lib/format';

const STATUS_COLOR = {
  open: '#F5A623', // risk
  in_progress: '#38E1C6', // scan
  recovered: '#34D399',
  stopped: '#F2637A',
};

const SIZE = 340;
const CENTER = SIZE / 2;
const MAX_RADIUS = CENTER - 24;
const RINGS = 4;

/** Places a case blip at a stable angle/radius derived from its id. */
function blipPosition(caseId, index) {
  const angleUnit = hashToUnit(caseId + ':angle');
  const radiusUnit = hashToUnit(caseId + ':radius' + index);
  const angle = angleUnit * Math.PI * 2;
  const radius = 28 + radiusUnit * (MAX_RADIUS - 28);
  return {
    x: CENTER + Math.cos(angle) * radius,
    y: CENTER + Math.sin(angle) * radius,
  };
}

export default function RadarHero({ cases = [], totalAtRiskAmount = 0, totalAtRiskCount = 0 }) {
  const visibleCases = cases.slice(0, 60); // cap for legibility on a small scope

  return (
    <div className="relative flex flex-col items-center">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        className="overflow-visible"
        role="img"
        aria-label={`Radar showing ${totalAtRiskCount} cases currently being tracked`}
      >
        {/* Range rings */}
        {Array.from({ length: RINGS }).map((_, i) => (
          <circle
            key={i}
            cx={CENTER}
            cy={CENTER}
            r={(MAX_RADIUS / RINGS) * (i + 1)}
            fill="none"
            stroke="#1E2A44"
            strokeWidth="1"
          />
        ))}

        {/* Crosshair */}
        <line x1={CENTER} y1={CENTER - MAX_RADIUS} x2={CENTER} y2={CENTER + MAX_RADIUS} stroke="#1E2A44" strokeWidth="1" />
        <line x1={CENTER - MAX_RADIUS} y1={CENTER} x2={CENTER + MAX_RADIUS} y2={CENTER} stroke="#1E2A44" strokeWidth="1" />

        {/* Sweep */}
        <g style={{ transformOrigin: `${CENTER}px ${CENTER}px` }} className="animate-sweep">
          <path
            d={`M ${CENTER} ${CENTER} L ${CENTER} ${CENTER - MAX_RADIUS} A ${MAX_RADIUS} ${MAX_RADIUS} 0 0 1 ${
              CENTER + MAX_RADIUS * Math.sin(0.5)
            } ${CENTER - MAX_RADIUS * Math.cos(0.5)} Z`}
            fill="url(#sweepGradient)"
            opacity="0.5"
          />
        </g>

        <defs>
          <radialGradient id="sweepGradient">
            <stop offset="0%" stopColor="#38E1C6" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#38E1C6" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Case blips */}
        {visibleCases.map((c, i) => {
          const { x, y } = blipPosition(c.id, i);
          const color = STATUS_COLOR[c.status] || STATUS_COLOR.open;
          const isActive = c.status === 'open' || c.status === 'in_progress';
          return (
            <circle
              key={c.id}
              cx={x}
              cy={y}
              r={isActive ? 4 : 3}
              fill={color}
              className={isActive ? 'animate-blipPulse' : ''}
              opacity={c.status === 'stopped' ? 0.55 : 1}
            >
              <title>
                {rootCauseLabelInline(c.root_cause)} — {c.status} — {formatRupees(c.amount)}
              </title>
            </circle>
          );
        })}
      </svg>

      {/* Center readout */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-xs uppercase tracking-[0.2em] text-ink-muted font-mono">₹ at risk</span>
        <span className="mt-1 text-3xl md:text-4xl font-mono font-semibold text-risk" data-numeric>
          {formatRupees(totalAtRiskAmount)}
        </span>
        <span className="mt-1 text-xs text-ink-faint font-mono">{totalAtRiskCount} cases tracked</span>
      </div>
    </div>
  );
}

function rootCauseLabelInline(rootCause) {
  return rootCause ? rootCause.replace(/_/g, ' ') : 'unknown';
}