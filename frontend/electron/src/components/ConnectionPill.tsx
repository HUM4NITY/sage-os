import { useSage } from '../lib/store';

export function ConnectionPill() {
  const connection = useSage((s) => s.connection);

  const status =
    connection === 'offline'
      ? 'offline'
      : connection === 'connecting' || connection === 'reconnecting'
        ? connection
        : 'connected';
  const ping = status === 'connecting' || status === 'reconnecting';
  const label =
    status === 'connected'
      ? 'connected'
        : status;
  const dotColor =
    status === 'connected'
      ? 'var(--color-moss)'
      : status === 'offline'
        ? 'var(--color-clay)'
        : 'var(--color-amber-soft)';

  return (
    <div
      className="flex items-center gap-2 rounded-full px-3 py-1 backdrop-blur"
      style={{
        background: 'var(--color-elevated-surface-strong)',
        border: '1px solid color-mix(in oklab, var(--color-line) 88%, transparent)',
      }}
    >
      <span className="relative flex h-1.5 w-1.5">
        {ping && (
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
            style={{ background: dotColor }}
          />
        )}
        <span
          className="relative inline-flex h-1.5 w-1.5 rounded-full"
          style={{ background: dotColor }}
        />
      </span>
      <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-ink-soft)]">
        {label}
      </span>
    </div>
  );
}
