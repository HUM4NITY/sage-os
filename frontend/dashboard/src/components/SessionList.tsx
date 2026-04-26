import Link from 'next/link';
import { SEVERITY_TONE, formatDate, formatTime, severityScoreColor } from '@/lib/format';
import type { SessionSummary } from '@/lib/fixtures';

export function SessionList({
  sessions,
  title = 'Recent sessions',
}: {
  sessions: SessionSummary[];
  title?: string;
}) {
  return (
    <article
      className="fade-up flex flex-col rounded-2xl"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-line)',
      }}
    >
      <header className="flex items-baseline justify-between px-7 pb-3 pt-6">
        <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-faint)]">
          {title}
        </span>
        <span className="text-[11px] tabular-nums text-[var(--color-ink-faint)]">
          {sessions.length} listed
        </span>
      </header>

      <ul className="divide-y" style={{ borderColor: 'var(--color-line)' }}>
        {sessions.map((s) => {
          const tone = SEVERITY_TONE[s.severity];
          const scoreColor = severityScoreColor(s.score);

          return (
            <li key={s.session_id}>
              <Link
                href={`/sessions/${s.session_id}`}
                prefetch={true}
                className="group grid grid-cols-[100px_1fr_auto] items-center gap-5 px-7 py-3.5 transition-colors hover:bg-[color-mix(in_oklab,var(--color-amber-glow)_18%,transparent)]"
                style={{ borderTop: '1px solid var(--color-line)' }}
              >
                <div className="flex flex-col">
                  <span className="text-[13px] tabular-nums" style={{ color: 'var(--color-ink)' }}>
                    {formatDate(s.started_at, { month: 'short', day: 'numeric' })}
                  </span>
                  <span className="text-[11px] tabular-nums text-[var(--color-ink-faint)]">
                    {formatTime(s.started_at)}
                  </span>
                </div>

                <div className="flex flex-col">
                  <span className="text-[13px]" style={{ color: 'var(--color-ink)' }}>
                    {s.primary_task}
                  </span>
                  <span className="text-[11px] text-[var(--color-ink-faint)]">
                    {tone.label}
                  </span>
                </div>

                <div className="flex items-baseline gap-2">
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: tone.dot }}
                  />
                  <span
                    className="text-[16px] tabular-nums"
                    style={{ color: scoreColor, fontVariantNumeric: 'tabular-nums' }}
                  >
                    {s.score}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
