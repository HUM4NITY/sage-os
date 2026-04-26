import { SEVERITY_TONE } from '@/lib/format';
import type { Patient, Severity } from '@/lib/fixtures';
import { ThemeToggle } from './ThemeToggle';

export function Header({
  patient,
  severity,
}: {
  patient: Patient;
  severity: Severity;
}) {
  const tone = SEVERITY_TONE[severity];

  return (
    <header
      className="sticky top-0 z-20 flex h-16 items-center justify-between px-10"
      style={{
        background: 'color-mix(in oklab, var(--color-surface) 92%, transparent)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid var(--color-line)',
      }}
    >
      <div className="flex items-baseline gap-3">
        <span
          className="serif text-[20px] tracking-[-0.01em]"
          style={{ color: 'var(--color-ink)', fontWeight: 500 }}
        >
          Sage
        </span>
        <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-faint)]">
          caregiver
        </span>
      </div>

      <div className="flex items-center gap-6">
        <ThemeToggle />

        <div className="flex items-baseline gap-2 text-[13px] text-[var(--color-ink-soft)]">
          <span style={{ color: 'var(--color-ink)' }}>{patient.name}</span>
          <span className="text-[var(--color-ink-faint)]">·</span>
          <span>{patient.age}</span>
          <span className="text-[var(--color-ink-faint)]">·</span>
          <span>{patient.city}</span>
        </div>

        <span
          className="rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-[0.18em]"
          style={{
            background: `color-mix(in oklab, ${tone.dot} 18%, transparent)`,
            color: tone.text,
          }}
        >
          {tone.label}
        </span>

        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-faint)]">
          <span className="relative flex h-1.5 w-1.5">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50"
              style={{ background: 'var(--color-moss)' }}
            />
            <span
              className="relative inline-flex h-1.5 w-1.5 rounded-full"
              style={{ background: 'var(--color-moss)' }}
            />
          </span>
          active
        </span>

        <div
          className="grid h-8 w-8 place-items-center rounded-full text-[12px] font-medium"
          style={{
            background: 'color-mix(in oklab, var(--color-amber-glow) 60%, var(--color-surface))',
            color: 'var(--color-amber-deep)',
            border: '1px solid color-mix(in oklab, var(--color-amber) 30%, transparent)',
          }}
          aria-label={`Caregiver: ${patient.caregiver_name}`}
          title={patient.caregiver_name}
        >
          SH
        </div>
      </div>
    </header>
  );
}
