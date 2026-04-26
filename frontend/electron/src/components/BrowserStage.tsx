import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useSage, type TranscriptEntry } from '../lib/store';

type TraceEntry = Extract<TranscriptEntry, { kind: 'trace' }>;
type Step = 'searching' | 'inspecting' | 'selected' | 'failed';

type BrowserStageState = {
  query: string;
  url: string;
  title: string;
  price: string | null;
  status: string;
  step: Step;
};

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL ?? 'http://localhost:3001';
const STAGE_WIDTH = 620;
const EDGE_GAP = 24;

/**
 * Live browser surface for both the real flow and the scripted demo.
 * It renders the latest Stagehand screenshot when one is available; otherwise
 * it falls back to a trace-driven summary card so the panel never lies about
 * what Sage is doing.
 */
export function BrowserStage() {
  const transcript = useSage((s) => s.transcript);
  const [position, setPosition] = useState(() => getDefaultPosition());
  const dragState = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const latestTrace = useMemo<TraceEntry | null>(() => {
    for (let i = transcript.length - 1; i >= 0; i--) {
      const entry = transcript[i];
      if (entry.kind === 'trace') return entry;
    }
    return null;
  }, [transcript]);

  const browserTraces = useMemo<TraceEntry[]>(() => {
    return transcript
      .filter((entry): entry is TraceEntry => entry.kind === 'trace' && entry.node === 'browser_agent')
      .slice(-8);
  }, [transcript]);

  const stage = useMemo(() => deriveBrowserStage(browserTraces), [browserTraces]);
  const latestBrowserTrace = browserTraces[browserTraces.length - 1] ?? null;
  const latestScreenshotTrace = [...browserTraces]
    .reverse()
    .find((entry) => entry.screenshotUrl);
  const browserActive = latestTrace?.node === 'browser_agent';
  const screenshotUrl = latestScreenshotTrace?.screenshotUrl
    ? resolveScreenshotUrl(latestScreenshotTrace.screenshotUrl)
    : null;

  useEffect(() => {
    const onResize = () => setPosition((current) => clampOverlayPosition(current));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!latestBrowserTrace) return null;

  return (
    <div
      aria-hidden={false}
      className="fixed z-20"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: 'min(620px, calc(100vw - 160px))',
        maxWidth: '620px',
        opacity: 1,
        transition:
          'opacity 280ms cubic-bezier(0.32, 0.72, 0.24, 1), box-shadow 220ms ease',
      }}
    >
      <div
      className="overflow-hidden rounded-[12px]"
      style={{
          background: 'var(--color-elevated-surface-strong)',
          border: '1px solid color-mix(in oklab, var(--color-line) 80%, transparent)',
          boxShadow:
            '0 28px 64px -24px rgba(31, 26, 20, 0.22), 0 6px 18px -6px rgba(31, 26, 20, 0.08)',
        }}
      >
          <BrowserChrome
            url={stage.url}
            onPointerDown={(event) => {
              dragState.current = {
                pointerId: event.pointerId,
                offsetX: event.clientX - position.x,
                offsetY: event.clientY - position.y,
              };
              const onMove = (moveEvent: PointerEvent) => {
                const drag = dragState.current;
                if (!drag || moveEvent.pointerId !== drag.pointerId) return;
                setPosition(
                  clampOverlayPosition({
                    x: moveEvent.clientX - drag.offsetX,
                    y: moveEvent.clientY - drag.offsetY,
                  }),
                );
              };
              const stopDragging = (upEvent: PointerEvent) => {
                if (!dragState.current || upEvent.pointerId !== dragState.current.pointerId) return;
                dragState.current = null;
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', stopDragging);
              };
              window.addEventListener('pointermove', onMove);
              window.addEventListener('pointerup', stopDragging);
            }}
          />
          <div className="px-6 py-4">
            <SearchHeader query={stage.query} step={stage.step} active={browserActive} />
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
              {screenshotUrl ? (
                <LiveScreenshot src={screenshotUrl} />
              ) : (
                <BrowserSummaryCard stage={stage} />
              )}
              <TraceStack traces={browserTraces} />
            </div>
          </div>
          <StatusBar text={latestBrowserTrace.text || stage.status} />
      </div>
    </div>
  );
}

function BrowserChrome({
  url,
  onPointerDown,
}: {
  url: string;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className="flex cursor-grab items-center gap-3 px-3 py-2 active:cursor-grabbing"
      onPointerDown={onPointerDown}
      style={{
        background: 'color-mix(in oklab, var(--color-surface) 92%, var(--color-bg))',
        borderBottom:
          '1px solid color-mix(in oklab, var(--color-line) 80%, transparent)',
      }}
    >
      <div className="flex gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#E36464' }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#E6B85E' }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#7CC07A' }} />
      </div>
      <div
      className="flex h-6 flex-1 items-center gap-2 rounded-full px-3 text-[11px]"
      style={{
          background: 'color-mix(in oklab, var(--color-surface) 92%, var(--color-bg))',
          border: '1px solid var(--color-line)',
          color: 'var(--color-ink-soft)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span className="text-[var(--color-ink-faint)]">url</span>
        <span className="truncate">{url}</span>
      </div>
      <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
        drag
      </span>
    </div>
  );
}

function SearchHeader({
  query,
  step,
  active,
}: {
  query: string;
  step: Step;
  active: boolean;
}) {
  const title = query ? `Looking up "${query}"` : 'Working on your request';
  const hint =
    step === 'selected'
      ? 'match ready'
      : step === 'failed'
        ? 'needs retry'
        : step === 'searching'
          ? 'searching'
          : 'reviewing';

  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <span
        className="text-[13px] font-medium"
        style={{ fontFamily: 'var(--font-sans)', color: 'var(--color-ink)' }}
      >
        {title}
      </span>
      <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
        <span
          className={`h-2 w-2 rounded-full ${active ? 'animate-pulse' : ''}`}
          style={{
            background:
              step === 'failed'
                ? 'var(--color-clay)'
                : step === 'selected'
                  ? 'var(--color-moss)'
                  : 'var(--color-amber)',
          }}
        />
        {hint}
      </span>
    </div>
  );
}

function LiveScreenshot({ src }: { src: string }) {
  return (
    <div
      className="overflow-hidden rounded-[10px]"
      style={{
        border: '1px solid color-mix(in oklab, var(--color-line) 72%, transparent)',
        background: 'var(--color-surface)',
      }}
    >
      <img
        src={src}
        alt="Live browser progress"
        className="block aspect-[16/10] w-full object-contain object-top"
      />
    </div>
  );
}

function BrowserSummaryCard({ stage }: { stage: BrowserStageState }) {
  const accent =
    stage.step === 'failed'
      ? 'var(--color-clay)'
      : stage.step === 'selected'
        ? 'var(--color-amber)'
        : 'var(--color-amber-deep)';

  return (
    <div
      className="flex gap-4 rounded-lg p-3"
      style={{
        border: '1px solid color-mix(in oklab, var(--color-line) 70%, transparent)',
        background:
          stage.step === 'selected'
            ? 'var(--color-accent-surface-subtle)'
            : stage.step === 'failed'
              ? 'color-mix(in oklab, var(--color-clay) 10%, var(--color-surface))'
              : 'var(--color-surface)',
      }}
    >
      <div
        className="grid h-[64px] w-[64px] flex-none place-items-center rounded-md"
      style={{
          background: 'var(--color-accent-surface)',
          border: '1px solid color-mix(in oklab, var(--color-amber) 18%, transparent)',
        }}
      >
        <BrowserGlyph />
      </div>

      <div className="flex flex-1 flex-col">
        <span
          className="text-[13px] font-medium leading-tight"
          style={{ fontFamily: 'var(--font-sans)', color: 'var(--color-ink)' }}
        >
          {stage.title}
        </span>
        <span className="mt-1 text-[10.5px] text-[var(--color-ink-soft)]">
          {stage.query ? `request: ${stage.query}` : 'routing the browser task'}
        </span>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span
            className="text-[16px] font-semibold tabular-nums"
            style={{ color: 'var(--color-ink)', fontFamily: 'var(--font-sans)' }}
          >
            {stage.price ?? 'in progress'}
          </span>
          <span
            className="rounded-full px-3 py-1 text-[10.5px] tracking-wide"
            style={{
              background:
                stage.step === 'selected'
                  ? 'var(--color-accent-surface-strong)'
                  : 'var(--color-accent-surface)',
              color: stage.step === 'selected' ? 'var(--color-ink)' : accent,
            }}
          >
            {labelForStep(stage.step)}
          </span>
        </div>
      </div>
    </div>
  );
}

function StatusBar({ text }: { text: string }) {
  return (
    <div
      className="flex items-center gap-2 px-6 py-2"
      style={{
        background: 'color-mix(in oklab, var(--color-bg) 80%, transparent)',
        borderTop: '1px solid color-mix(in oklab, var(--color-line) 80%, transparent)',
      }}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-amber)] opacity-50" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-amber)]" />
      </span>
      <span
        className="truncate text-[11px] italic text-[var(--color-ink-soft)]"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {text}
      </span>
    </div>
  );
}

function TraceStack({ traces }: { traces: TraceEntry[] }) {
  return (
    <div
      className="rounded-[10px] px-4 py-3"
      style={{
        border: '1px solid color-mix(in oklab, var(--color-line) 72%, transparent)',
        background: 'color-mix(in oklab, var(--color-bg) 78%, transparent)',
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-faint)]">
          live steps
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-faint)]">
          {traces.length}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {traces.slice(-4).map((trace) => (
          <li key={trace.id} className="flex flex-col gap-1">
            <span
              className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-amber-deep)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {trace.node.replaceAll('_', ' ')}
            </span>
            <span
              className="text-[12px] leading-snug text-[var(--color-ink-soft)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {trace.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function deriveBrowserStage(traces: TraceEntry[]): BrowserStageState {
  let query = '';
  let title = 'Opening the browser';
  let price: string | null = null;
  let step: Step = 'searching';
  let status = 'preparing browser';

  for (const trace of traces) {
    const text = trace.text.trim();
    const lower = text.toLowerCase();
    status = text || status;

    const openingMatch = text.match(/opening amazon for:\s*(.+)$/i);
    if (openingMatch) {
      query = openingMatch[1].trim();
      title = 'Searching Amazon';
      step = 'searching';
      continue;
    }

    const searchMatch = text.match(/searching:\s*"([^"]+)"/i);
    if (searchMatch) {
      query = searchMatch[1].trim();
      title = 'Searching Amazon';
      step = 'searching';
      continue;
    }

    const resultMatch = text.match(/(?:found|selected):\s*(.+?)(?:\s+[·|-]\s+(\$[^\s].*))?$/i);
    if (resultMatch) {
      title = resultMatch[1].trim();
      price = resultMatch[2]?.trim() ?? price;
      step = 'selected';
      continue;
    }

    if (lower.startsWith('failed:')) {
      title = 'Browser task needs another try';
      step = 'failed';
      continue;
    }

    if (lower.includes('loading amazon')) {
      title = 'Loading results';
      step = 'searching';
      continue;
    }
  }

  if (!query && title !== 'Opening the browser') {
    query = title;
  }

  return {
    query,
    url: query ? `amazon.com/s?k=${encodeURIComponent(query)}` : 'amazon.com',
    title,
    price,
    status,
    step,
  };
}

function labelForStep(step: Step) {
  switch (step) {
    case 'selected':
      return 'match ready';
    case 'failed':
      return 'retry';
    case 'inspecting':
      return 'reviewing';
    default:
      return 'searching';
  }
}

function BrowserGlyph() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden>
      <g
        stroke="var(--color-amber-deep)"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="7" y="11" width="34" height="24" rx="4" />
        <line x1="7" y1="18" x2="41" y2="18" />
        <circle cx="13" cy="14.5" r="1.2" fill="var(--color-amber-deep)" stroke="none" />
        <circle cx="17" cy="14.5" r="1.2" fill="var(--color-amber-deep)" stroke="none" />
        <circle cx="21" cy="14.5" r="1.2" fill="var(--color-amber-deep)" stroke="none" />
        <path d="M20 28c0-3.3 2.7-6 6-6" />
        <circle cx="27" cy="25" r="5.5" />
        <line x1="31" y1="29" x2="35.5" y2="33.5" />
      </g>
    </svg>
  );
}

function resolveScreenshotUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  return new URL(url, BRIDGE_URL).toString();
}

function getDefaultPosition() {
  if (typeof window === 'undefined') {
    return { x: 260, y: 88 };
  }
  return clampOverlayPosition({
    x: Math.round((window.innerWidth - STAGE_WIDTH) / 2),
    y: 88,
  });
}

function clampOverlayPosition(position: { x: number; y: number }) {
  if (typeof window === 'undefined') return position;
  const maxX = Math.max(EDGE_GAP, window.innerWidth - STAGE_WIDTH - EDGE_GAP);
  const maxY = Math.max(EDGE_GAP, window.innerHeight - 260);
  return {
    x: Math.min(Math.max(position.x, EDGE_GAP), maxX),
    y: Math.min(Math.max(position.y, EDGE_GAP), maxY),
  };
}
