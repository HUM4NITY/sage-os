import { useSage } from '../lib/store';

/** Dev-only feed of incoming socket events. Toggle with the demo-mode switch (F21). */
export function DebugPanel() {
  const events = useSage((s) => s.debug);

  return (
    <div className="pointer-events-none absolute right-8 top-24 z-10 w-[360px]">
      <div className="rounded-xl border border-[var(--color-line)] bg-white/70 p-3 backdrop-blur">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-faint)]">
            event feed
          </span>
          <span className="text-[10px] tracking-[0.1em] text-[var(--color-ink-faint)]">
            {events.length} / 30
          </span>
        </div>

        <ul className="font-mono text-[11px] leading-relaxed text-[var(--color-ink-soft)]">
          {events.length === 0 && (
            <li className="italic text-[var(--color-ink-faint)]">waiting for events…</li>
          )}
          {events.slice(0, 12).map((e) => (
            <li
              key={e.id}
              className="flex items-start gap-2 truncate"
              style={{ opacity: 1 - events.indexOf(e) * 0.06 }}
            >
              <span className="text-[var(--color-ink-faint)]">
                {new Date(e.ts).toLocaleTimeString(undefined, { hour12: false })}
              </span>
              <span className="text-[var(--color-amber-deep)]">{e.event}</span>
              <span className="truncate text-[var(--color-ink-faint)]">
                {summarize(e.payload)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function summarize(p: unknown): string {
  if (p == null) return '';
  if (typeof p === 'string') return p.slice(0, 36);
  try {
    return JSON.stringify(p).slice(0, 64);
  } catch {
    return '';
  }
}
