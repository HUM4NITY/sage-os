import { useMemo } from 'react';
import {
  COGNITIVE_FIXTURE,
  type CognitiveOverview,
  type SeverityTier,
} from '../lib/fixtures/cognitive';
import { useSage } from '../lib/store';

const SEVERITY_TONE: Record<SeverityTier, { number: string; chip: string }> = {
  'ok':         { number: 'var(--color-moss)',      chip: 'var(--color-moss)' },
  'watch':      { number: 'var(--color-amber)',     chip: 'var(--color-amber)' },
  'attention':  { number: 'var(--color-clay)',      chip: 'var(--color-clay)' },
  'follow-up':  { number: 'var(--color-clay)',      chip: 'var(--color-clay)' },
};

/**
 * Floating card on the bottom-left of the patient screen.
 * Big tabular score + 30-day sparkline + one small label line.
 * Fixture data for now — when /caregiver/trend lands, swap COGNITIVE_FIXTURE
 * for a fetch that returns the same shape.
 */
export function CognitiveWidget({
  data,
}: {
  data?: CognitiveOverview;
}) {
  const cognitive = useSage((s) => s.cognitive);
  const resolved = data ?? cognitive.data ?? COGNITIVE_FIXTURE;
  const tone = SEVERITY_TONE[resolved.today.severity];
  const path = useMemo(() => buildSparkPath(resolved.trend.map((p) => p.score)), [resolved.trend]);

  const dipIndex = useMemo(() => {
    let mi = 0;
    resolved.trend.forEach((p, i) => {
      if (p.score < resolved.trend[mi].score) mi = i;
    });
    return mi;
  }, [resolved.trend]);

  const dipPoint = useMemo(() => {
    const xs = resolved.trend.length - 1;
    const min = 50, max = 100;
    const x = (dipIndex / xs) * 100;
    const y = 100 - ((resolved.trend[dipIndex].score - min) / (max - min)) * 100;
    return { x, y };
  }, [dipIndex, resolved.trend]);

  const deltaSign = resolved.today.baseline_delta < 0 ? '↓' : resolved.today.baseline_delta > 0 ? '↑' : '·';

  return (
    <div
      className="absolute bottom-6 left-8 z-10 w-[340px] overflow-hidden rounded-[14px] backdrop-blur"
      style={{
        background: 'color-mix(in oklab, var(--color-surface) 88%, transparent)',
        border: '1px solid color-mix(in oklab, var(--color-line) 80%, transparent)',
        boxShadow:
          '0 12px 28px -12px rgba(31, 26, 20, 0.10), 0 2px 6px -2px rgba(31, 26, 20, 0.06)',
      }}
    >
      <div className="flex items-stretch gap-4 px-5 py-4">
        {/* score block */}
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-faint)]">
            today
          </span>
          <span
            className="mt-0.5 text-[40px] font-light leading-none tabular-nums"
            style={{
              color: tone.number,
              fontFamily: 'var(--font-serif)',
              fontFeatureSettings: '"tnum"',
            }}
          >
            {resolved.today.score}
          </span>
          <div className="mt-1.5 flex items-center gap-2">
            <span
              className="rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-[0.16em]"
              style={{
                background: 'color-mix(in oklab, ' + tone.chip + ' 18%, transparent)',
                color: tone.chip,
              }}
            >
              {resolved.today.severity}
            </span>
            <span className="text-[10px] tracking-wide text-[var(--color-ink-faint)] tabular-nums">
              {deltaSign} {Math.abs(resolved.today.baseline_delta)} vs base
            </span>
          </div>
        </div>

        {/* sparkline */}
        <div className="ml-auto flex flex-col items-end justify-center">
          <span className="mb-1 text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-faint)]">
            30 days
          </span>
          <svg
            viewBox="0 0 100 50"
            preserveAspectRatio="none"
            className="h-12 w-[150px]"
            aria-hidden
          >
            {/* baseline reference line */}
            <line
              x1="0" y1={lerpY(82)} x2="100" y2={lerpY(82)}
              stroke="var(--color-line)"
              strokeWidth="0.5"
              strokeDasharray="1.5 2.5"
            />
            {/* area fill */}
            <path
              d={`${path} L 100 50 L 0 50 Z`}
              fill="color-mix(in oklab, var(--color-amber-soft) 20%, transparent)"
            />
            {/* line */}
            <path
              d={path}
              fill="none"
              stroke="var(--color-amber)"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* dip marker */}
            <circle
              cx={dipPoint.x}
              cy={dipPoint.y}
              r="1.6"
              fill="var(--color-clay)"
            />
          </svg>
        </div>
      </div>
      <WidgetState status={cognitive.status} message={cognitive.message} />
    </div>
  );
}

function WidgetState({
  status,
  message,
}: {
  status: ReturnType<typeof useSage.getState>['cognitive']['status'];
  message: string | null;
}) {
  if (status === 'ready') {
    return (
      <div className="border-t border-[var(--color-line)] px-5 py-2.5 text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
        latest caregiver signal ready
      </div>
    );
  }

  return (
    <div
      className="border-t px-5 py-2.5 text-[11px]"
      style={{ borderColor: 'var(--color-line)', color: 'var(--color-ink-soft)' }}
    >
      {status === 'loading' && (
        <div className="flex items-center gap-3">
          <div className="skeleton-line h-2 w-[72px] flex-none rounded-full" />
          <div className="skeleton-line h-2 w-full rounded-full" />
        </div>
      )}
      <span className={status === 'loading' ? 'mt-2 inline-block' : ''}>
        {message}
      </span>
    </div>
  );
}

function lerpY(score: number, min = 50, max = 100): number {
  const clamped = Math.max(min, Math.min(max, score));
  return 50 - ((clamped - min) / (max - min)) * 50;
}

/** Build a smoothed SVG path from a series of scores. Catmull-Rom approximation. */
function buildSparkPath(scores: number[]): string {
  if (scores.length === 0) return '';
  const xs = scores.length - 1;
  const pts = scores.map((s, i) => ({ x: (i / xs) * 100, y: lerpY(s) }));

  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? pts[i + 1];

    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}
