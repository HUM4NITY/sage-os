import { notFound } from 'next/navigation';
import { AnnotatedTranscript } from '@/components/AnnotatedTranscript';
import { getSessionDetail } from '@/lib/api';
import { SEVERITY_TONE, formatDate, formatDuration, formatTime, severityScoreColor } from '@/lib/format';

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSessionDetail(id);
  if (!session) notFound();

  const tone = SEVERITY_TONE[session.severity];
  const scoreColor = severityScoreColor(session.score);

  return (
    <div className="flex flex-col gap-10">
      <header className="fade-up flex flex-col gap-3">
        <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-faint)]">
          session
        </span>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-1">
            <h1
              className="serif text-[32px] leading-tight tracking-[-0.01em]"
              style={{ color: 'var(--color-ink)', fontWeight: 500 }}
            >
              {session.primary_task}
            </h1>
            <p className="text-[13px] text-[var(--color-ink-soft)]">
              {formatDate(session.started_at, { weekday: 'long', month: 'short', day: 'numeric' })}
              {' · '}
              {formatTime(session.started_at)}
              {' · '}
              {formatDuration(session.duration_seconds)}
            </p>
          </div>

          <div className="flex items-baseline gap-3">
            <span
              className="serif text-[56px] leading-none tabular-nums"
              style={{ color: scoreColor, fontWeight: 300 }}
            >
              {session.score}
            </span>
            <span
              className="rounded-full px-2.5 py-0.5 text-[11px] uppercase tracking-[0.18em]"
              style={{
                background: `color-mix(in oklab, ${tone.dot} 18%, transparent)`,
                color: tone.text,
              }}
            >
              {tone.label}
            </span>
          </div>
        </div>

        <p
          className="max-w-2xl serif text-[15px] italic leading-[1.6]"
          style={{ color: 'var(--color-ink-soft)' }}
        >
          {session.summary}
        </p>
      </header>

      <section className="fade-up grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="lexical diversity" value={session.metrics.lexical_diversity.toFixed(2)} />
        <Metric label="repetitions" value={String(session.metrics.repetition_count)} />
        <Metric label="hesitations" value={String(session.metrics.hesitation_count)} />
        <Metric label="topic drifts" value={String(session.metrics.topic_drift_count)} />
      </section>

      <section>
        <AnnotatedTranscript session={session} />
      </section>

      {session.suggested_exercises.length > 0 && (
        <section
          className="fade-up rounded-2xl px-7 py-6"
          style={{
            background: 'color-mix(in oklab, var(--color-amber-glow) 14%, transparent)',
            border: '1px solid color-mix(in oklab, var(--color-amber-soft) 28%, transparent)',
          }}
        >
          <span
            className="text-[10px] uppercase tracking-[0.22em]"
            style={{ color: 'var(--color-amber-deep)' }}
          >
            gentle next step
          </span>
          <ul className="mt-3 flex flex-col gap-2">
            {session.suggested_exercises.map((ex, i) => (
              <li
                key={i}
                className="serif text-[15px] leading-[1.55]"
                style={{ color: 'var(--color-ink)' }}
              >
                · {ex}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex flex-col rounded-xl px-5 py-4"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-line)',
      }}
    >
      <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-faint)]">
        {label}
      </span>
      <span
        className="mt-1 serif text-[24px] leading-tight tabular-nums"
        style={{ color: 'var(--color-ink)', fontWeight: 500 }}
      >
        {value}
      </span>
    </div>
  );
}
