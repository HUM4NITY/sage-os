import { useEffect, useRef } from 'react';
import { useSage, type TranscriptEntry } from '../lib/store';

/**
 * Vertical column on the left, full height between header and footer.
 * Bottom-up reading order — newest at the bottom, scroll auto-pinned.
 *
 * Typography hierarchy (intentional, large):
 *   - User utterance      18px serif italic, deep ink-soft
 *   - Sage utterance      18px sans, warm amber-deep
 *   - Agent trace         11px mono, tracking-wider, opacity 0.45
 *
 * The rail has zero hard chrome — no panel background, just a faint vertical
 * hairline on its right edge so the eye understands the column without
 * competing with the orb.
 */
export function TranscriptRail({
  bottomReserve = 0,
}: {
  /** Pixels of clearance to leave at the bottom (e.g. for the cognitive widget). */
  bottomReserve?: number;
}) {
  const transcript = useSage((s) => s.transcript);
  const partial = useSage((s) => s.partial);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // auto-scroll to newest
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [transcript.length, partial?.text]);

  const empty = transcript.length === 0 && !partial;

  return (
    <aside
      aria-label="conversation"
      className="absolute left-0 top-20 z-10 w-[400px]
                 overflow-y-auto px-9 pt-8 pb-12
                 [scrollbar-gutter:stable]"
      style={{
        bottom: bottomReserve + 80,
        // hairline divider, barely visible
        borderRight: '1px solid color-mix(in oklab, var(--color-line) 70%, transparent)',
        // subtle gradient fade at the top so old messages dissolve, not cut
        maskImage:
          'linear-gradient(to bottom, transparent 0, #000 56px, #000 calc(100% - 24px), transparent 100%)',
        WebkitMaskImage:
          'linear-gradient(to bottom, transparent 0, #000 56px, #000 calc(100% - 24px), transparent 100%)',
      }}
    >
      <div className="flex min-h-full flex-col justify-end gap-6">
        {empty && <EmptyState />}

        {transcript.map((entry) => (
          <Entry key={entry.id} entry={entry} />
        ))}

        {partial && <PartialEntry text={partial.text} speaker={partial.speaker} />}

        <div ref={bottomRef} />
      </div>
    </aside>
  );
}

function EmptyState() {
  return (
    <div className="self-start">
      <p
        className="text-[13px] italic text-[var(--color-ink-faint)]"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        Sage is listening for you.
      </p>
    </div>
  );
}

function Entry({ entry }: { entry: TranscriptEntry }) {
  if (entry.kind === 'trace') return <TraceLine node={entry.node} text={entry.text} />;
  if (entry.kind === 'user') return <UserLine text={entry.text} />;
  return <SageLine text={entry.text} />;
}

function UserLine({ text }: { text: string }) {
  return (
    <div className="sage-fade-in flex flex-col gap-1.5">
      <SpeakerLabel>Eleanor</SpeakerLabel>
      <p
        className="text-[18px] leading-[1.6] text-[var(--color-ink)]"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        {text}
      </p>
    </div>
  );
}

function SageLine({ text }: { text: string }) {
  return (
    <div className="sage-fade-in flex flex-col gap-1.5">
      <SpeakerLabel accent>Sage</SpeakerLabel>
      <p
        className="text-[18px] leading-[1.6] text-[var(--color-amber-deep)]"
        style={{ fontFamily: 'var(--font-sans)', fontWeight: 450 }}
      >
        {text}
      </p>
    </div>
  );
}

function PartialEntry({
  text,
  speaker,
}: {
  text: string;
  speaker: 'user' | 'sage';
}) {
  const isUser = speaker === 'user';
  return (
    <div className="flex flex-col gap-1.5 opacity-90">
      <SpeakerLabel accent={!isUser}>{isUser ? 'Eleanor' : 'Sage'}</SpeakerLabel>
      <p
        className="text-[18px] leading-[1.6]"
        style={{
          fontFamily: isUser ? 'var(--font-serif)' : 'var(--font-sans)',
          fontWeight: isUser ? 400 : 450,
          color: isUser
            ? 'var(--color-ink)'
            : 'var(--color-amber-deep)',
        }}
      >
        {text}
        <span className="ml-0.5 inline-block w-[2px] translate-y-0.5 align-baseline sage-cursor" />
      </p>
    </div>
  );
}

function TraceLine({ node, text }: { node: string; text: string }) {
  return (
    <div className="sage-fade-in self-stretch pl-1">
      <p
        className="text-[11px] uppercase tracking-[0.16em]
                   text-[var(--color-ink-faint)] opacity-70"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        <span className="text-[var(--color-amber)]">·</span>{' '}
        <span className="text-[var(--color-ink-soft)]">{node}</span>{' '}
        <span className="lowercase tracking-normal text-[var(--color-ink-faint)]">
          {text}
        </span>
      </p>
    </div>
  );
}

function SpeakerLabel({
  children,
  accent,
}: {
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <span
      className="text-[10px] font-medium uppercase tracking-[0.22em]"
      style={{
        color: accent ? 'var(--color-amber)' : 'var(--color-ink-faint)',
      }}
    >
      {children}
    </span>
  );
}
