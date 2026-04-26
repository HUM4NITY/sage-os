'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrendPoint } from '@/lib/fixtures';
import { formatDate } from '@/lib/format';

export function TrendChart({
  data,
  baseline = 82,
}: {
  data: TrendPoint[];
  baseline?: number;
}) {
  const formatted = data.map((p) => ({
    ...p,
    label: formatDate(p.date),
  }));

  const lowest = data.reduce((min, p) => (p.score < min.score ? p : min), data[0]);

  return (
    <article
      className="fade-up flex flex-col rounded-2xl px-7 py-6"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-line)',
      }}
    >
      <header className="mb-1 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-faint)]">
          30-day trend
        </span>
        <span className="text-[11px] tabular-nums text-[var(--color-ink-faint)]">
          baseline {baseline}
        </span>
      </header>

      <div className="-ml-3 mt-2 h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={formatted} margin={{ top: 12, right: 8, bottom: 4, left: 8 }}>
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="var(--color-amber-soft)" stopOpacity={0.34} />
                <stop offset="100%" stopColor="var(--color-amber-soft)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-line)" strokeDasharray="0" vertical={false} opacity={0.5} />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: 'var(--color-ink-faint)' }}
              minTickGap={48}
              tickMargin={10}
            />
            <YAxis hide domain={[40, 100]} />
            <ReferenceLine
              y={baseline}
              stroke="var(--color-ink-faint)"
              strokeDasharray="2 4"
              strokeOpacity={0.6}
            />
            <Tooltip
              cursor={{ stroke: 'var(--color-amber)', strokeWidth: 1, strokeDasharray: '3 3', strokeOpacity: 0.6 }}
              contentStyle={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-line)',
                borderRadius: 10,
                padding: '6px 10px',
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
                color: 'var(--color-ink)',
                boxShadow: '0 12px 28px -12px rgba(0,0,0,0.12)',
              }}
              labelStyle={{
                color: 'var(--color-ink-faint)',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.16em',
                marginBottom: 2,
              }}
              formatter={(value: number) => [`${value}`, 'score']}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke="var(--color-amber)"
              strokeWidth={1.6}
              fill="url(#trendFill)"
              dot={false}
              activeDot={{ r: 4, fill: 'var(--color-amber)', stroke: 'var(--color-surface)', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <footer className="mt-3 flex items-center justify-between text-[11px] text-[var(--color-ink-faint)]">
        <span>
          lowest: <span style={{ color: 'var(--color-clay)' }}>{lowest.score}</span> on{' '}
          {formatDate(lowest.date, { month: 'short', day: 'numeric' })}
        </span>
        <span className="tabular-nums">{data.length} sessions</span>
      </footer>
    </article>
  );
}
