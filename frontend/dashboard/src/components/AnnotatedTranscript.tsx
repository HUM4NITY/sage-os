'use client';

import { useMemo, useRef, useState } from 'react';
import type { FlaggedPhrase, SessionDetail } from '@/lib/fixtures';

const LABEL_TEXT: Record<FlaggedPhrase['label'], string> = {
  'word-finding': 'word-finding',
  repetition: 'repetition',
  hesitation: 'hesitation',
  'topic-drift': 'topic drift',
};

const LABEL_DESC: Record<FlaggedPhrase['label'], string> = {
  'word-finding':
    'A pause or substitution where a specific word didn\'t come quickly. Common; worth tracking over time.',
  repetition:
    'A phrase or question repeated within the same session. Could be conversational, or worth noting if frequent.',
  hesitation:
    'A pause longer than typical for this speaker. One signal among many.',
  'topic-drift':
    'A turn that changed subject without a clear bridge. Watch for patterns.',
};

export function AnnotatedTranscript({ session }: { session: SessionDetail }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [flashed, setFlashed] = useState<string | null>(null);

  const flaggedById = useMemo(() => {
    return session.flagged_phrases.map((p, i) => ({ ...p, id: `${i}-${p.phrase}` }));
  }, [session.flagged_phrases]);

  const scrollToPhrase = (phrase: string) => {
    if (!containerRef.current) return;
    const el = containerRef.current.querySelector<HTMLElement>(
      `[data-phrase="${cssEscape(phrase)}"]`,
    );
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashed(phrase);
    setTimeout(() => setFlashed(null), 700);
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      {/* transcript column */}
      <div ref={containerRef} className="fade-up flex flex-col gap-6">
        {session.transcript.map((line, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <span
              className="text-[10px] font-medium uppercase tracking-[0.22em]"
              style={{
                color:
                  line.speaker === 'sage'
                    ? 'var(--color-amber)'
                    : 'var(--color-ink-faint)',
              }}
            >
              {line.speaker === 'sage' ? 'Sage' : 'Eleanor'}
            </span>
            <p
              className="serif text-[18px] leading-[1.65]"
              style={{ color: 'var(--color-ink)' }}
            >
              {renderLineWithHighlights(line.text, flaggedById, flashed)}
            </p>
          </div>
        ))}
      </div>

      {/* flagged phrases rail */}
      <aside className="fade-up flex flex-col gap-3">
        <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-faint)]">
          flagged phrases
        </span>
        {flaggedById.length === 0 && (
          <p className="serif text-[13px] italic text-[var(--color-ink-faint)]">
            No phrases flagged in this session.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {flaggedById.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => scrollToPhrase(p.phrase)}
                className="group flex w-full flex-col gap-1 rounded-lg px-4 py-3 text-left transition-colors hover:bg-[color-mix(in_oklab,var(--color-amber-glow)_18%,transparent)]"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-line)',
                }}
              >
                <div className="flex items-baseline justify-between">
                  <span
                    className="text-[10px] uppercase tracking-[0.18em]"
                    style={{ color: 'var(--color-amber-deep)' }}
                  >
                    {LABEL_TEXT[p.label]}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-faint)]">
                    {p.severity}
                  </span>
                </div>
                <p
                  className="serif text-[14px] italic leading-snug"
                  style={{ color: 'var(--color-ink-soft)' }}
                >
                  &ldquo;{p.phrase}&rdquo;
                </p>
              </button>
            </li>
          ))}
        </ul>

        {flaggedById.length > 0 && (
          <details
            className="mt-2 rounded-lg px-4 py-3 text-[12px] text-[var(--color-ink-soft)]"
            style={{
              background: 'color-mix(in oklab, var(--color-amber-glow) 14%, transparent)',
              border: '1px solid color-mix(in oklab, var(--color-amber-soft) 24%, transparent)',
            }}
          >
            <summary className="cursor-pointer text-[10px] uppercase tracking-[0.2em] text-[var(--color-amber-deep)]">
              what these labels mean
            </summary>
            <dl className="mt-3 flex flex-col gap-2">
              {Object.entries(LABEL_DESC).map(([label, desc]) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <dt
                    className="text-[10px] uppercase tracking-[0.18em]"
                    style={{ color: 'var(--color-amber-deep)' }}
                  >
                    {LABEL_TEXT[label as FlaggedPhrase['label']]}
                  </dt>
                  <dd className="serif text-[12px] italic leading-snug">{desc}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}
      </aside>
    </div>
  );
}

function renderLineWithHighlights(
  text: string,
  flagged: (FlaggedPhrase & { id: string })[],
  flashedPhrase: string | null,
) {
  if (flagged.length === 0) return text;

  // sort by length desc to avoid nested matches
  const sorted = [...flagged].sort((a, b) => b.phrase.length - a.phrase.length);

  type Span = { start: number; end: number; phrase: FlaggedPhrase };
  const spans: Span[] = [];
  for (const f of sorted) {
    const lower = text.toLowerCase();
    const target = f.phrase.toLowerCase();
    const idx = lower.indexOf(target);
    if (idx === -1) continue;
    const overlaps = spans.some(
      (s) => !(idx + target.length <= s.start || idx >= s.end),
    );
    if (overlaps) continue;
    spans.push({ start: idx, end: idx + target.length, phrase: f });
  }
  spans.sort((a, b) => a.start - b.start);

  const out: React.ReactNode[] = [];
  let cursor = 0;
  spans.forEach((s, i) => {
    if (cursor < s.start) out.push(text.slice(cursor, s.start));
    const isFlashed = flashedPhrase === s.phrase.phrase;
    out.push(
      <span
        key={`f-${i}`}
        data-phrase={s.phrase.phrase}
        className={`flagged ${isFlashed ? 'flash' : ''}`}
        title={LABEL_TEXT[s.phrase.label]}
      >
        {text.slice(s.start, s.end)}
      </span>,
    );
    cursor = s.end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

function cssEscape(s: string): string {
  return s.replace(/["\\]/g, '\\$&');
}
