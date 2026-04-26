'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/',          label: 'Overview',  hint: 'today + trend' },
  { href: '/sessions',  label: 'Sessions',  hint: 'history + transcripts' },
  { href: '/trends',    label: 'Trends',    hint: 'long-range markers' },
  { href: '/ask',       label: 'Ask Sage',  hint: 'natural-language query' },
];

export function LeftRail({ since }: { since: string }) {
  const pathname = usePathname();

  return (
    <aside
      className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 flex-col px-5 py-8 lg:flex"
      style={{
        background: 'var(--color-surface)',
        borderRight: '1px solid var(--color-line)',
      }}
    >
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active =
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group relative flex flex-col rounded-md px-3 py-2 transition-colors"
              style={{
                background: active
                  ? 'color-mix(in oklab, var(--color-amber-glow) 30%, transparent)'
                  : 'transparent',
              }}
            >
              <span
                aria-hidden
                className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-full"
                style={{
                  background: active ? 'var(--color-amber)' : 'transparent',
                  transition: 'background 200ms ease',
                }}
              />
              <span
                className="text-[10px] uppercase tracking-[0.2em]"
                style={{
                  color: active ? 'var(--color-amber-deep)' : 'var(--color-ink-soft)',
                }}
              >
                {item.label}
              </span>
              <span className="mt-0.5 text-[11px] text-[var(--color-ink-faint)]">
                {item.hint}
              </span>
            </Link>
          );
        })}
      </nav>

      <div
        className="mt-auto flex flex-col gap-1 border-t pt-4"
        style={{ borderColor: 'var(--color-line)' }}
      >
        <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-faint)]">
          following
        </span>
        <span className="text-[12px] text-[var(--color-ink-soft)]">
          Eleanor since {new Date(since).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
        </span>
        <span className="text-[10px] italic text-[var(--color-ink-faint)]">
          built with care.
        </span>
      </div>
    </aside>
  );
}
