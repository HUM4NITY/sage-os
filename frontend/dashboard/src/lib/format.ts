import type { Severity } from './fixtures';

export const SEVERITY_TONE: Record<Severity, { dot: string; text: string; label: string }> = {
  ok:          { dot: 'var(--color-moss)',   text: 'var(--color-moss)',   label: 'all good' },
  watch:       { dot: 'var(--color-amber)',  text: 'var(--color-amber)',  label: 'watch' },
  attention:   { dot: 'var(--color-clay)',   text: 'var(--color-clay)',   label: 'attention' },
  'follow-up': { dot: 'var(--color-clay)',   text: 'var(--color-clay)',   label: 'follow-up' },
};

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  return new Date(iso).toLocaleDateString(undefined, opts);
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m} min ${s.toString().padStart(2, '0')} s`;
}

export function severityScoreColor(score: number): string {
  if (score >= 85) return 'var(--color-moss)';
  if (score >= 70) return 'var(--color-amber)';
  if (score >= 50) return 'var(--color-clay)';
  return 'var(--color-clay)';
}
