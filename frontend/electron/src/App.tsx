import { useEffect, useRef, useState } from 'react';
import { AgentTracePanel } from './components/AgentTracePanel';
import { BrowserStage } from './components/BrowserStage';
import { CognitiveWidget } from './components/CognitiveWidget';
import { ConnectionPill } from './components/ConnectionPill';
import { DebugPanel } from './components/DebugPanel';
import { Orb } from './components/Orb';
import { OrbDevPanel } from './components/OrbDevPanel';
import { TalkBar } from './components/TalkBar';
import { ThemeToggle } from './components/ThemeToggle';
import { TranscriptRail } from './components/TranscriptRail';
import { useSocketBridge } from './lib/useSocketBridge';
import { useTtsPlayback } from './lib/useTtsPlayback';
import { useVoiceLoop } from './lib/useVoiceLoop';
import { useSage } from './lib/store';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL ?? 'http://127.0.0.1:3001';

export default function App() {
  useSocketBridge();
  useTtsPlayback();
  const { beginTalk, endTalk, endSession } = useVoiceLoop();
  const orb = useSage((s) => s.orb);
  const demo = useSage((s) => s.demoMode);
  const toggleDemo = useSage((s) => s.toggleDemoMode);
  const showEventFeed = useSage((s) => s.showEventFeed);
  const toggleEventFeed = useSage((s) => s.toggleEventFeed);
  const showDevPanel = useSage((s) => s.showDevPanel);
  const toggleDevPanel = useSage((s) => s.toggleDevPanel);
  const clearExperience = useSage((s) => s.clearExperience);
  const spaceHeldRef = useRef(false);
  const [demoRunning, setDemoRunning] = useState(false);

  useEffect(() => {
    const isEditable = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return el.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    };

    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.code === 'Space' || e.key === ' ') && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (isEditable(e.target)) return;
        e.preventDefault();
        if (!spaceHeldRef.current) {
          spaceHeldRef.current = true;
          void beginTalk();
        }
        return;
      }
      // ⌘⇧D — toggle demo mode (rail + agent trace panel)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && k === 'd') {
        e.preventDefault();
        toggleDemo();
      }
      // ⌘⇧K — toggle dev kit (orb state buttons + color swatches)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && k === 'k') {
        e.preventDefault();
        toggleDevPanel();
      }
      // ⌘⇧E — raw JSON event feed (developer-only)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && k === 'e') {
        e.preventDefault();
        toggleEventFeed();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') {
        if (!spaceHeldRef.current) return;
        e.preventDefault();
        spaceHeldRef.current = false;
        void endTalk();
      }
    };
    const onBlur = () => {
      if (!spaceHeldRef.current) return;
      spaceHeldRef.current = false;
      void endTalk();
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [beginTalk, endTalk, toggleDemo, toggleEventFeed, toggleDevPanel]);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const runDemo = async () => {
    if (demoRunning) return;
    clearExperience();
    setDemoRunning(true);
    try {
      const response = await fetch(`${BRIDGE_URL}/internal/demo-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: import.meta.env.VITE_PATIENT_ID ?? 'p_eleanor' }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.reason || `HTTP ${response.status}`);
      }
    } catch (error) {
      useSage
        .getState()
        .appendTrace(
          'demo',
          error instanceof Error
            ? `demo unavailable: ${error.message}`
            : 'demo unavailable right now',
        );
    } finally {
      setDemoRunning(false);
    }
  };

  const clearView = async () => {
    if (useSage.getState().sessionStarted) {
      await endSession();
    }
    clearExperience();
  };

  const [verbIndex, setVerbIndex] = useState(0);
  useEffect(() => {
    if (orb !== 'thinking') {
      setVerbIndex(0);
      return;
    }
    const id = setInterval(() => {
      setVerbIndex(i => (i + 1) % 4);
    }, 1200);
    return () => clearInterval(id);
  }, [orb]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[var(--bg)] text-[var(--color-ink)]">
      {/* Subtle ambient gradient — gives the cream depth without competing */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(1100px 760px at 50% 56%, var(--color-ambient-halo), transparent 70%)',
        }}
      />

      {/* Top bar */}
      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-8 py-6">
        <div className="flex items-baseline gap-2">
          <span className="wordmark text-[22px] tracking-[-0.01em] text-[var(--color-ink)]">
            Sage
          </span>
          <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-faint)]">
            patient
          </span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <ConnectionPill />
        </div>
      </header>

      {/* Center stage */}
      <main className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="relative flex flex-col items-center gap-10">
          <BrowserStage />
          <Orb size={350} />
          <p
            key={`${orb}-${verbIndex}`}
            className="sage-fade-in text-[16px] italic tracking-wide text-[var(--color-ink-soft)]"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {labelFor(orb, verbIndex)}
            {['listening', 'thinking', 'speaking'].includes(orb) && (
              <span aria-hidden className="ml-[1px] inline-block">
                <span className="sage-dot">.</span>
                <span className="sage-dot">.</span>
                <span className="sage-dot">.</span>
              </span>
            )}
          </p>
        </div>
      </main>

      <TalkBar
        onBeginTalk={beginTalk}
        onEndTalk={endTalk}
        onEndSession={endSession}
        onClear={clearView}
        onRunDemo={runDemo}
        demoRunning={demoRunning}
      />

      <footer className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-end gap-6 px-8 py-5">
        <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-faint)]">
          {now.toLocaleString(undefined, {
            weekday: 'long',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </span>
      </footer>

      <TranscriptRail bottomReserve={120} />
      {demo && <CognitiveWidget />}
      {/* Agent trace lives on the right; if dev panel is showing, leave room
          for it (~480px) so they don't overlap. */}
      <AgentTracePanel bottomReserve={showDevPanel ? 480 : 0} />
      {showDevPanel && <OrbDevPanel />}
      {showEventFeed && <DebugPanel />}
    </div>
  );
}

function labelFor(state: string, verbIndex: number = 0): string {
  // No trailing period — animated dots are appended by the JSX.
  switch (state) {
    case 'listening': return 'Sage is listening';
    case 'thinking': {
      const verbs = ['understanding', 'analyzing', 'processing', 'synthesizing'];
      return `Sage is ${verbs[verbIndex]}`;
    }
    case 'speaking':  return 'Sage is speaking';
    case 'complete':  return 'Done';
    default:          return 'Sage is awake';
  }
}
