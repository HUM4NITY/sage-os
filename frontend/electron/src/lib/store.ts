import { create } from 'zustand';
import type { OrbState } from './events';
import {
  COGNITIVE_FIXTURE,
  type CognitiveOverview,
  type SeverityTier,
} from './fixtures/cognitive';

type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';
type MicPermissionState = 'unknown' | 'granted' | 'denied';
type CognitiveStatus = 'fixture' | 'loading' | 'ready' | 'error';
type OrchestratorStatus = 'checking' | 'ready' | 'offline';

type DebugEvent = {
  id: number;
  ts: number;
  event: string;
  payload: unknown;
};

export type TranscriptEntry =
  | { id: number; ts: number; kind: 'user'; text: string }
  | { id: number; ts: number; kind: 'sage'; text: string }
  | {
      id: number;
      ts: number;
      kind: 'trace';
      node: string;
      text: string;
      screenshotUrl?: string;
    };

export type PartialUtterance = {
  speaker: 'user' | 'sage';
  text: string;
} | null;

export type CognitiveState = {
  status: CognitiveStatus;
  data: CognitiveOverview;
  message: string | null;
  updatedAt: number | null;
};

type SageStore = {
  connection: ConnectionStatus;
  setConnection: (s: ConnectionStatus) => void;

  orchestrator: OrchestratorStatus;
  setOrchestrator: (s: OrchestratorStatus) => void;

  orb: OrbState;
  setOrb: (s: OrbState) => void;

  /** Rolling debug feed (newest first) */
  debug: DebugEvent[];
  pushDebug: (event: string, payload: unknown) => void;

  /** Committed transcript (oldest first; UI renders bottom-up) */
  transcript: TranscriptEntry[];
  /** In-progress STT or TTS partial — shown with a typing cursor */
  partial: PartialUtterance;

  micPermission: MicPermissionState;
  micError: string | null;
  pushToTalkActive: boolean;
  sessionStarted: boolean;
  speakerLevel: number;
  sessionCost: number | null;
  cognitive: CognitiveState;

  appendUser: (text: string) => void;
  appendSage: (text: string) => void;
  appendTrace: (node: string, text: string, screenshotUrl?: string) => void;
  setPartial: (p: PartialUtterance) => void;
  clearTranscript: () => void;
  clearExperience: () => void;
  setMicPermission: (state: MicPermissionState, error?: string | null) => void;
  setPushToTalkActive: (active: boolean) => void;
  setSessionStarted: (started: boolean) => void;
  setSpeakerLevel: (level: number) => void;
  setSessionCost: (total: number) => void;
  beginAnalysis: () => void;
  setAnalysisError: (message?: string) => void;
  applyAnalysis: (score: number, severity: SeverityTier, sessionId: string) => void;

  demoMode: boolean;
  toggleDemoMode: () => void;

  showEventFeed: boolean;
  toggleEventFeed: () => void;

  showDevPanel: boolean;
  toggleDevPanel: () => void;
};

let _id = 0;
const nextId = () => ++_id;

export const useSage = create<SageStore>((set) => ({
  connection: 'connecting',
  setConnection: (s) => set({ connection: s }),

  orchestrator: 'checking',
  setOrchestrator: (s) => set({ orchestrator: s }),

  orb: 'idle',
  setOrb: (s) => set({ orb: s }),

  debug: [],
  pushDebug: (event, payload) =>
    set((st) => ({
      debug: [{ id: nextId(), ts: Date.now(), event, payload }, ...st.debug].slice(0, 30),
    })),

  transcript: [],
  partial: null,
  micPermission: 'unknown',
  micError: null,
  pushToTalkActive: false,
  sessionStarted: false,
  speakerLevel: 0,
  sessionCost: null,
  cognitive: {
    status: 'fixture',
    data: COGNITIVE_FIXTURE,
    message: 'Using seeded baseline until the latest session is analyzed.',
    updatedAt: null,
  },

  appendUser: (text) =>
    set((st) => ({
      transcript: [...st.transcript, { id: nextId(), ts: Date.now(), kind: 'user' as const, text }].slice(-80),
      partial: null,
    })),
  appendSage: (text) =>
    set((st) => ({
      transcript: [...st.transcript, { id: nextId(), ts: Date.now(), kind: 'sage' as const, text }].slice(-80),
      partial: null,
    })),
  appendTrace: (node, text, screenshotUrl) =>
    set((st) => ({
      transcript: [
        ...st.transcript,
        { id: nextId(), ts: Date.now(), kind: 'trace' as const, node, text, screenshotUrl },
      ].slice(-80),
    })),
  setPartial: (p) => set({ partial: p }),
  clearTranscript: () => set({ transcript: [], partial: null }),
  clearExperience: () =>
    set((st) => ({
      transcript: [],
      partial: null,
      debug: [],
      orb: 'idle',
      pushToTalkActive: false,
      sessionStarted: false,
      sessionCost: null,
      speakerLevel: 0,
      cognitive:
        st.cognitive.status === 'loading'
          ? {
              ...st.cognitive,
              status: 'fixture',
              message: 'Ready for a fresh turn.',
            }
          : st.cognitive,
    })),
  setMicPermission: (state, error = null) => set({ micPermission: state, micError: error }),
  setPushToTalkActive: (active) => set({ pushToTalkActive: active }),
  setSessionStarted: (started) => set({ sessionStarted: started }),
  setSpeakerLevel: (level) => set({ speakerLevel: Math.max(0, Math.min(1, level)) }),
  setSessionCost: (total) => set({ sessionCost: total }),
  beginAnalysis: () =>
    set((st) => ({
      cognitive: {
        ...st.cognitive,
        status: 'loading',
        message: 'Analyzing this session for the caregiver summary...',
      },
    })),
  setAnalysisError: (message = "We couldn't refresh the latest cognitive signal yet. Showing the last saved view.") =>
    set((st) => ({
      cognitive: {
        ...st.cognitive,
        status: 'error',
        message,
      },
    })),
  applyAnalysis: (score, severity, sessionId) =>
    set((st) => ({
      cognitive: {
        status: 'ready',
        data: mergeCognitiveUpdate(st.cognitive.data, score, severity),
        message: `Updated from session ${sessionId}.`,
        updatedAt: Date.now(),
      },
    })),

  demoMode: false,
  toggleDemoMode: () => set((st) => ({ demoMode: !st.demoMode })),

  showEventFeed: false,
  toggleEventFeed: () => set((st) => ({ showEventFeed: !st.showEventFeed })),

  showDevPanel: false,
  toggleDevPanel: () => set((st) => ({ showDevPanel: !st.showDevPanel })),
}));

function mergeCognitiveUpdate(
  current: CognitiveOverview,
  score: number,
  severity: SeverityTier,
): CognitiveOverview {
  const baseline = current.today.baseline;
  const today = new Date().toISOString().slice(0, 10);
  const nextPoint = { date: today, score, severity };

  const trend =
    current.trend[current.trend.length - 1]?.date === today
      ? [...current.trend.slice(0, -1), nextPoint]
      : [...current.trend, nextPoint].slice(-30);

  return {
    today: {
      score,
      severity,
      baseline,
      baseline_delta: score - baseline,
    },
    trend,
  };
}
