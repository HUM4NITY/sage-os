import { TrendChart } from '@/components/TrendChart';
import { getOverview, getTrend } from '@/lib/api';

export default async function TrendsPage() {
  const [overview, trend] = await Promise.all([getOverview(), getTrend(undefined, 30)]);

  return (
    <div className="flex flex-col gap-8">
      <header className="fade-up flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-faint)]">
          trends
        </span>
        <h1
          className="serif text-[36px] leading-tight tracking-[-0.01em]"
          style={{ color: 'var(--color-ink)', fontWeight: 500 }}
        >
          Long-range view
        </h1>
        <p className="serif text-[15px] italic text-[var(--color-ink-soft)]">
          How Eleanor&apos;s recent sessions sit against her baseline.
        </p>
      </header>
      <TrendChart data={trend} baseline={overview.baseline} />
    </div>
  );
}
