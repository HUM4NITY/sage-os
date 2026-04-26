import { useEffect } from 'react';
import { socket, on, onAny } from './socket';
import { useSage } from './store';

const BRIDGE_URL =
  import.meta.env.VITE_BRIDGE_URL ?? 'http://127.0.0.1:3001';

/**
 * Owns the socket → store bridge. Mount once at app root.
 * - tracks connection lifecycle
 * - mirrors `orb:state` into the store
 * - feeds transcript entries into the store from STT, TTS, and agent traces
 * - feeds the debug panel from `onAny`
 */
export function useSocketBridge() {
  useEffect(() => {
    const set = useSage.getState();

    const onConnect = () => set.setConnection('connected');
    const onDisconnect = () => {
      const state = useSage.getState();
      state.setConnection('offline');
      state.setSessionStarted(false);
      state.setPushToTalkActive(false);
      state.setSpeakerLevel(0);
    };
    const onReconnectAttempt = () => set.setConnection('reconnecting');
    const onConnectError = () => set.setConnection('reconnecting');

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.io.on('reconnect_attempt', onReconnectAttempt);
    socket.io.on('error', onConnectError);

    if (socket.connected) set.setConnection('connected');
    else set.setConnection('connecting');

    let cancelled = false;
    const checkOrchestrator = async () => {
      try {
        const response = await fetch(`${BRIDGE_URL}/health`, {
          signal: AbortSignal.timeout(2500),
        });
        const payload = await response.json().catch(() => ({ ok: response.ok, orchestrator_ok: false }));
        if (!cancelled) {
          set.setOrchestrator(response.ok && payload.orchestrator_ok ? 'ready' : 'offline');
        }
      } catch {
        if (!cancelled) {
          set.setOrchestrator('offline');
        }
      }
    };
    void checkOrchestrator();
    const healthTimer = window.setInterval(() => {
      void checkOrchestrator();
    }, 8000);

    const offOrb = on('orb:state', (p) => set.setOrb(p.state));

    // user transcript (mic → STT)
    const offTPart = on('transcript:partial', (p) =>
      useSage.getState().setPartial({ speaker: 'user', text: p.text }),
    );
    const offTFinal = on('transcript:final', (p) =>
      useSage.getState().appendUser(p.text),
    );

    // assistant text being spoken (TTS)
    const offAPart = on('assistant:partial', (p) =>
      useSage.getState().setPartial({ speaker: 'sage', text: p.text }),
    );
    const offAFinal = on('assistant:final', (p) =>
      useSage.getState().appendSage(p.text),
    );

    // agent reasoning trace
    const offTrace = on('agent:trace', (p) =>
      useSage.getState().appendTrace(p.node, p.text, p.screenshot_url),
    );
    const offAnalysis = on('analysis:ready', (p) =>
      useSage.getState().applyAnalysis(p.score, p.severity, p.session_id),
    );
    const offCost = on('session:cost', (p) =>
      useSage.getState().setSessionCost(p.total),
    );
    const offSessionEnd = on('session:end', () => {
      const state = useSage.getState();
      state.setPushToTalkActive(false);
      state.setSpeakerLevel(0);
      if (state.orb === 'speaking') state.setOrb('complete');
    });

    const offAny = onAny((event, payload) => {
      if (event === 'heartbeat') return;
      useSage.getState().pushDebug(event, payload);
    });

    return () => {
      cancelled = true;
      window.clearInterval(healthTimer);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.io.off('reconnect_attempt', onReconnectAttempt);
      socket.io.off('error', onConnectError);
      offOrb();
      offTPart();
      offTFinal();
      offAPart();
      offAFinal();
      offTrace();
      offAnalysis();
      offCost();
      offSessionEnd();
      offAny();
    };
  }, []);
}
