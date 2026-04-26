import type { SeverityTier } from './fixtures/cognitive';

/** Wire-format contract with the backend bridge. Keep in sync with PLAN_A_BACKEND.md §B7/B14. */

export type OrbState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'complete';

export type ServerEvents = {
  heartbeat: { ts: number };

  'orb:state': { state: OrbState };

  'transcript:partial': { text: string; speaker?: 'user' | 'sage' };
  'transcript:final': { text: string; speaker?: 'user' | 'sage' };

  'assistant:partial': { text: string };
  'assistant:final': { text: string };

  'agent:trace': {
    node: string;
    text: string;
    screenshot_url?: string;
  };

  'tts:chunk': { url?: string; b64?: string };
  'tts:done': { ms: number };

  'analysis:ready': {
    session_id: string;
    score: number;
    severity: SeverityTier;
  };

  'session:cost': { total: number };
  'session:end': { reason?: string };
};

export type ClientEvents = {
  hello: void;
  'audio:chunk': ArrayBuffer | string;
  'audio:end': void;
  'session:start': { patient_id: string };
  'session:end': void;
};

export type ServerEventName = keyof ServerEvents;
