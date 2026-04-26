import { useEffect, useState } from 'react';
import { useSage } from '../lib/store';
import { playDemoSequence } from '../lib/demoEvents';
import type { OrbState } from '../lib/events';

type Preset = {
  id: string;
  label: string;
  core: string;
  rim: string;
  glow: string;
  shadow: string;
};

const PRESETS: Preset[] = [
  { id: 'amber',     label: 'amber',     core: '#ffd89b', rim: '#c8841c', glow: '#ffe6b8', shadow: 'rgba(200,132,28,0.18)' },
  { id: 'rose',      label: 'rose',      core: '#ffd2c2', rim: '#cc6650', glow: '#ffd9cb', shadow: 'rgba(204,102,80,0.16)' },
  { id: 'aubergine', label: 'aubergine', core: '#d3b8e0', rim: '#5e3f7a', glow: '#e7d3ef', shadow: 'rgba(94,63,122,0.18)' },
  { id: 'moss',      label: 'moss',      core: '#dde8b8', rim: '#6f8a5a', glow: '#e9efd0', shadow: 'rgba(111,138,90,0.16)' },
  { id: 'sky',       label: 'sky',       core: '#d2e7f4', rim: '#4a7a99', glow: '#dbecf8', shadow: 'rgba(74,122,153,0.16)' },
  { id: 'pearl',     label: 'pearl',     core: '#fff4dc', rim: '#bfae8a', glow: '#fff0d0', shadow: 'rgba(180,160,120,0.14)' },
];

const STATES: OrbState[] = ['idle', 'listening', 'thinking', 'speaking', 'complete'];

function applyPreset(p: Preset) {
  const r = document.documentElement.style;
  r.setProperty('--orb-core', p.core);
  r.setProperty('--orb-rim', p.rim);
  r.setProperty('--orb-glow', p.glow);
  r.setProperty('--orb-shadow', p.shadow);
  window.dispatchEvent(new CustomEvent('sage:colors-changed'));
}

export function OrbDevPanel() {
  const orb = useSage((s) => s.orb);
  const setOrb = useSage((s) => s.setOrb);
  const clearTranscript = useSage((s) => s.clearTranscript);
  const [activePreset, setActivePreset] = useState<string>('amber');
  const [playing, setPlaying] = useState(false);

  // restore last preset
  useEffect(() => {
    const saved = localStorage.getItem('sage:orb-preset');
    if (saved) {
      const p = PRESETS.find((x) => x.id === saved);
      if (p) {
        setActivePreset(p.id);
        applyPreset(p);
      }
    }
  }, []);

  const choose = (p: Preset) => {
    setActivePreset(p.id);
    applyPreset(p);
    localStorage.setItem('sage:orb-preset', p.id);
  };

  return (
    <div className="pointer-events-auto absolute bottom-16 right-8 z-10 w-[280px]">
      <div className="rounded-xl border border-[var(--color-line)] bg-white/70 p-4 backdrop-blur">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-faint)]">
            orb
          </span>
          <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-soft)]">
            {orb}
          </span>
        </div>

        {/* state cycler */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {STATES.map((s) => (
            <button
              key={s}
              onClick={() => setOrb(s)}
              className="rounded-full border px-2.5 py-1 text-[11px] tracking-wide transition-all"
              style={{
                borderColor: orb === s ? 'var(--color-amber)' : 'var(--color-line)',
                background: orb === s ? 'var(--color-amber-glow)' : 'transparent',
                color: orb === s ? 'var(--color-amber-deep)' : 'var(--color-ink-soft)',
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* color presets */}
        <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-faint)]">
          color
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => choose(p)}
              title={p.label}
              className="group relative h-7 w-7 rounded-full border-2 transition-all"
              style={{
                borderColor:
                  activePreset === p.id ? 'var(--color-ink)' : 'transparent',
                background: `radial-gradient(circle at 35% 30%, ${p.core} 0%, ${p.rim} 80%)`,
                boxShadow: `0 6px 14px -6px ${p.shadow}`,
              }}
            >
              <span className="sr-only">{p.label}</span>
            </button>
          ))}
        </div>

        <div className="mt-3 text-[10px] leading-relaxed text-[var(--color-ink-faint)]">
          Click a swatch to hot-swap the orb. Use ⌘+Shift+D to hide this panel
          before the demo.
        </div>

        <div className="mt-4 border-t border-[var(--color-line)] pt-3">
          <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-faint)]">
            preview
          </div>
          <div className="flex gap-2">
            <button
              disabled={playing}
              onClick={async () => {
                setPlaying(true);
                try { await playDemoSequence(); } finally { setPlaying(false); }
              }}
              className="flex-1 rounded-full border border-[var(--color-amber)] bg-[var(--color-amber-glow)] px-3 py-1.5 text-[11px] tracking-wide text-[var(--color-amber-deep)] transition-opacity disabled:opacity-50"
            >
              {playing ? 'playing demo…' : '▶ play demo turn'}
            </button>
            <button
              onClick={clearTranscript}
              className="rounded-full border border-[var(--color-line)] px-3 py-1.5 text-[11px] tracking-wide text-[var(--color-ink-soft)] hover:bg-white/40"
            >
              clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
