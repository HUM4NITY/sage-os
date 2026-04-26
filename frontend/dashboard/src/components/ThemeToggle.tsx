'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'sage-theme-preference';

export function ThemeToggle() {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const sync = () => setChecked(resolveIsDark());
    sync();

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (!window.localStorage.getItem(STORAGE_KEY)) {
        sync();
      }
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return (
    <label className="inline-flex min-h-10 items-center gap-3">
      <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-faint)]">
        {checked ? 'dark' : 'light'}
      </span>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(event) => {
          const next = event.target.checked;
          setChecked(next);
          setThemePreference(next ? 'dark' : 'light');
        }}
        aria-label={`Toggle theme. Current mode: ${checked ? 'dark' : 'light'}.`}
      />
      <span
        aria-hidden
        className="relative h-6 w-11 rounded-full transition-colors duration-200"
        style={{
          background: checked
            ? 'var(--color-accent-surface-strong)'
            : 'color-mix(in oklab, var(--color-line) 75%, var(--color-surface))',
          border: '1px solid color-mix(in oklab, var(--color-line) 90%, transparent)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <span
          className="absolute top-0.5 h-[18px] w-[18px] rounded-full transition-all duration-200"
          style={{
            left: checked ? '22px' : '3px',
            background: checked ? 'var(--color-amber)' : 'var(--color-surface)',
            boxShadow: checked
              ? '0 0 0 1px color-mix(in oklab, var(--color-amber) 36%, transparent)'
              : '0 1px 8px rgba(0,0,0,0.16)',
          }}
        />
      </span>
    </label>
  );
}

function resolveIsDark() {
  const explicit = window.localStorage.getItem(STORAGE_KEY);
  if (explicit === 'dark') return true;
  if (explicit === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function setThemePreference(preference: 'dark' | 'light') {
  window.localStorage.setItem(STORAGE_KEY, preference);
  document.documentElement.setAttribute('data-theme', preference);
}
