import { useEffect, useMemo, useRef } from 'react';
import { useSage, type TranscriptEntry } from '../lib/store';

/**
 * Right-column "live reasoning" view of agent trace events.
 * Reads the same trace entries as the transcript rail, but presents them
 * as a focused stream so judges can see the multi-agent flow at a glance.
 *
 * Visual contract:
 *   - mirror of TranscriptRail on the opposite side (1px left hairline)
 *   - "what sage is doing" header in tiny tracked uppercase
 *   - each entry: <node> in amber accent + body in mono italic
 *   - vertical amber bar on the newest entry — eye anchor
 *   - older entries fade to ~40% opacity (rolloff visible without being noisy)
 */
type TraceEntry = Extract<TranscriptEntry, { kind: 'trace' }>;

export function AgentTracePanel({ bottomReserve = 0 }: { bottomReserve?: number }) {
  // IMPORTANT: select the raw transcript (stable reference between mutations),
  // then derive the filtered list with useMemo. Filtering INSIDE the Zustand
  // selector returns a new array every call → infinite re-renders.
  const transcript = useSage((s) => s.transcript);
  const visible = useMemo<TraceEntry[]>(
    () =>
      transcript.filter((e): e is TraceEntry => e.kind === 'trace').slice(-14),
    [transcript],
  );
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [visible.length]);

  return (
    <aside
      aria-label="agent reasoning"
      className="absolute right-0 top-20 z-10 flex w-[360px] flex-col"
      style={{
        bottom: bottomReserve + 80,
        borderLeft:
          '1px solid color-mix(in oklab, var(--color-line) 70%, transparent)',
      }}
    >
      <header className="flex items-center justify-between px-9 pt-8 pb-2">
        <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-faint)]">
          what Sage is doing
        </span>
        <span className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-amber)] opacity-50" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-amber)]" />
          </span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-faint)]">
            live
          </span>
        </span>
      </header>

      <div
        className="flex-1 overflow-y-auto px-9 py-4 [scrollbar-gutter:stable]"
        style={{
          maskImage:
            'linear-gradient(to bottom, transparent 0, #000 32px, #000 calc(100% - 24px), transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(to bottom, transparent 0, #000 32px, #000 calc(100% - 24px), transparent 100%)',
        }}
      >
        <ul className="flex min-h-full flex-col justify-end gap-3">
          {visible.length === 0 && <EmptyState />}
          {visible.map((t, i) => {
            const isLatest = i === visible.length - 1;
            const age = visible.length - 1 - i; // 0 = newest
            // ramp opacity from 1.0 (newest) down to 0.42 (oldest visible)
            const opacity = Math.max(0.42, 1 - age * 0.06);
            return (
              <li
                key={t.id}
                className="sage-fade-in relative flex flex-col gap-0.5 pl-3"
                style={{ opacity }}
              >
                {/* left rule — solid amber for newest, faint for older */}
                <span
                  aria-hidden
                  className="absolute left-0 top-0 h-full w-[2px] rounded-full"
                  style={{
                    background: isLatest
                      ? 'var(--color-amber)'
                      : 'color-mix(in oklab, var(--color-line) 60%, transparent)',
                  }}
                />
                <span
                  className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-amber-deep)]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {t.node}
                </span>
                <span
                  className="text-[12.5px] italic leading-snug text-[var(--color-ink-soft)]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {t.text}
                </span>
              </li>
            );
          })}
          <div ref={bottomRef} />
        </ul>
      </div>
    </aside>
  );
}

function EmptyState() {
  return (
    <li className="self-end pl-3">
      <p
        className="text-[12px] italic text-[var(--color-ink-faint)]"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        idle — waiting for a turn.
      </p>
    </li>
  );
}
