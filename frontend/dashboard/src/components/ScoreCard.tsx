import { SEVERITY_TONE, formatDate, formatTime, formatDuration } from '@/lib/format';
import type { Overview } from '@/lib/fixtures';

export function ScoreCard({ overview }: { overview: Overview }) {
  const { latest_session, baseline, baseline_delta } = overview;
  const tone = SEVERITY_TONE[latest_session.severity];
  const deltaArrow = baseline_delta < 0 ? '↓' : baseline_delta > 0 ? '↑' : '·';

  return (
    <article
      className="fade-up relative overflow-hidden rounded-2xl px-8 py-7"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-line)',
      }}
    >
      <header className="flex items-start justify-between">
        <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-faint)]">
          today's session
        </span>
        <SageGlyph />
      </header>

      <div className="mt-3 flex items-baseline gap-3">
        <span
          className="serif text-[88px] leading-none tabular-nums"
          style={{
            color: tone.text,
            fontWeight: 300,
            fontFeatureSettings: '"tnum"',
          }}
        >
          {latest_session.score}
        </span>
        <span className="text-[14px] text-[var(--color-ink-faint)]">/ 100</span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <span
          className="rounded-full px-2.5 py-0.5 text-[11px] uppercase tracking-[0.18em]"
          style={{
            background: `color-mix(in oklab, ${tone.dot} 18%, transparent)`,
            color: tone.text,
          }}
        >
          {tone.label}
        </span>
        <span className="text-[13px] tabular-nums text-[var(--color-ink-soft)]">
          {deltaArrow} {Math.abs(baseline_delta)} from baseline {baseline}
        </span>
      </div>

      <p
        className="mt-5 max-w-xl serif text-[15px] leading-[1.55] italic"
        style={{ color: 'var(--color-ink-soft)' }}
      >
        {overview.summary_text}
      </p>

      <footer className="mt-6 flex items-center gap-2 text-[12px] text-[var(--color-ink-faint)]">
        <span>{formatDate(latest_session.started_at, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
        <span>·</span>
        <span>{formatTime(latest_session.started_at)}</span>
        <span>·</span>
        <span>{formatDuration(latest_session.duration_seconds)}</span>
        <span>·</span>
        <span>{latest_session.primary_task}</span>
      </footer>
    </article>
  );
}

function SageGlyph() {
  return (
    <span
      aria-hidden
      className="grid h-9 w-9 place-items-center rounded-full"
      style={{
        background:
          'radial-gradient(circle at 35% 30%, var(--color-amber-glow) 0%, var(--color-amber) 80%)',
        boxShadow: '0 4px 12px -4px color-mix(in oklab, var(--color-amber) 50%, transparent)',
      }}
    />
  );
}
