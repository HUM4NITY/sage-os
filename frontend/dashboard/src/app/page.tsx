import { ScoreCard } from '@/components/ScoreCard';
import { TrendChart } from '@/components/TrendChart';
import { SessionList } from '@/components/SessionList';
import { getOverview, getTrend, getSessions } from '@/lib/api';

export default async function OverviewPage() {
  const [overview, trend, sessions] = await Promise.all([
    getOverview(),
    getTrend(undefined, 30),
    getSessions(undefined, 8),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="overview"
        title="Today, with Eleanor"
        subtitle="What changed, what's stable, and where to look next."
      />

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <ScoreCard overview={overview} />
        <TrendChart data={trend} baseline={overview.baseline} />
      </section>

      <section>
        <SessionList sessions={sessions} title="Recent sessions" />
      </section>
    </div>
  );
}

function PageHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <header className="fade-up flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-faint)]">
        {eyebrow}
      </span>
      <h1
        className="serif text-[36px] leading-tight tracking-[-0.01em]"
        style={{ color: 'var(--color-ink)', fontWeight: 500 }}
      >
        {title}
      </h1>
      <p className="serif text-[15px] italic text-[var(--color-ink-soft)]">{subtitle}</p>
    </header>
  );
}
