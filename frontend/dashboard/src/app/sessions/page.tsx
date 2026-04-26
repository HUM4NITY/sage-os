import { SessionList } from '@/components/SessionList';
import { getSessions } from '@/lib/api';

export default async function SessionsPage() {
  const sessions = await getSessions(undefined, 30);
  return (
    <div className="flex flex-col gap-8">
      <header className="fade-up flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-faint)]">
          sessions
        </span>
        <h1
          className="serif text-[36px] leading-tight tracking-[-0.01em]"
          style={{ color: 'var(--color-ink)', fontWeight: 500 }}
        >
          History
        </h1>
        <p className="serif text-[15px] italic text-[var(--color-ink-soft)]">
          Every conversation, summarised and searchable.
        </p>
      </header>
      <SessionList sessions={sessions} title="All sessions" />
    </div>
  );
}
