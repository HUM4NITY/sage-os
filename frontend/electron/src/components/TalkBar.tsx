import { useEffect } from 'react';
import { useSage } from '../lib/store';

type TalkBarProps = {
  onBeginTalk: () => void | Promise<void>;
  onEndTalk: () => void | Promise<void>;
  onEndSession: () => void | Promise<void>;
  onClear: () => void | Promise<void>;
  onRunDemo: () => void | Promise<void>;
  demoRunning?: boolean;
};

export function TalkBar({
  onBeginTalk,
  onEndTalk,
  onEndSession,
  onClear,
  onRunDemo,
  demoRunning = false,
}: TalkBarProps) {
  const connection = useSage((s) => s.connection);
  const orchestrator = useSage((s) => s.orchestrator);
  const micPermission = useSage((s) => s.micPermission);
  const micError = useSage((s) => s.micError);
  const pushToTalkActive = useSage((s) => s.pushToTalkActive);
  const sessionStarted = useSage((s) => s.sessionStarted);
  const sessionCost = useSage((s) => s.sessionCost);
  const cognitive = useSage((s) => s.cognitive);
  const demoMode = useSage((s) => s.demoMode);

  useEffect(() => {
    if (!pushToTalkActive) return;
    const stop = () => {
      void onEndTalk();
    };
    window.addEventListener('pointerup', stop);
    return () => window.removeEventListener('pointerup', stop);
  }, [onEndTalk, pushToTalkActive]);

  const talkDisabled = (connection !== 'connected' && !pushToTalkActive) || demoRunning;
  const endDisabled = !sessionStarted || cognitive.status === 'loading';
  const clearDisabled = pushToTalkActive || demoRunning;
  const demoDisabled = demoRunning || connection !== 'connected';

  return (
    <div className="pointer-events-auto absolute bottom-10 left-1/2 z-20 w-max max-w-[92vw] -translate-x-1/2">
      <div className="flex flex-col items-center gap-3">
        {micPermission === 'denied' && (
          <div
            className="w-full max-w-[560px] rounded-[18px] px-5 py-4 text-center"
            style={{
              background: 'color-mix(in oklab, var(--color-surface) 90%, transparent)',
              border: '1px solid color-mix(in oklab, var(--color-clay) 22%, var(--color-line))',
              boxShadow: '0 16px 40px -24px rgba(31, 26, 20, 0.18)',
            }}
          >
            <p className="text-[14px] leading-6 text-[var(--color-ink)]">
              Sage needs the microphone to listen. Please allow microphone access in system settings, then try again.
            </p>
            {micError && (
              <p className="mt-1 text-[12px] italic text-[var(--color-ink-soft)]">{micError}</p>
            )}
          </div>
        )}

        <div
          className="flex w-full flex-col items-center gap-2 rounded-[24px] px-2 py-2 backdrop-blur sm:flex-row sm:justify-center sm:rounded-full"
          style={{
            background: 'var(--color-elevated-surface)',
            border: '1px solid color-mix(in oklab, var(--color-line) 84%, transparent)',
            boxShadow:
              '0 26px 64px -30px rgba(31, 26, 20, 0.22), 0 12px 24px -18px rgba(31, 26, 20, 0.10)',
          }}
        >
          <button
            type="button"
            disabled={talkDisabled}
            onPointerDown={(event) => {
              if (talkDisabled) return;
              event.preventDefault();
              void onBeginTalk();
            }}
            onPointerUp={(event) => {
              event.preventDefault();
              void onEndTalk();
            }}
            onPointerCancel={() => void onEndTalk()}
            onPointerLeave={(event) => {
              if (pushToTalkActive && event.buttons === 0) {
                void onEndTalk();
              }
            }}
            className="min-h-[50px] w-full rounded-full px-6 text-[15px] font-medium tracking-[0.01em] transition-all duration-300 sm:w-auto sm:min-w-[240px]"
            style={{
              background: talkDisabled
                ? 'color-mix(in oklab, var(--color-line) 55%, var(--color-surface))'
                : pushToTalkActive
                  ? 'var(--color-amber)'
                  : 'var(--color-accent-surface-strong)',
              color: talkDisabled || pushToTalkActive ? 'var(--color-surface)' : 'var(--color-amber-deep)',
              boxShadow: pushToTalkActive
                ? '0 20px 44px -24px rgba(200, 132, 28, 0.6)'
                : '0 10px 24px -20px rgba(15, 15, 15, 0.3)',
              transform: pushToTalkActive ? 'translateY(-1px) scale(1.01)' : 'translateY(0) scale(1)',
            }}
          >
            {pushToTalkActive ? 'Listening... release when you are done' : 'Hold to speak'}
          </button>

          <button
            type="button"
            disabled={endDisabled}
            onClick={() => void onEndSession()}
            className="min-h-[48px] w-full rounded-full px-5 text-[14px] transition-opacity disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
            style={{
              background: 'transparent',
              border: '1px solid color-mix(in oklab, var(--color-line) 88%, transparent)',
              color: 'var(--color-ink-soft)',
            }}
          >
            {cognitive.status === 'loading' ? 'Preparing summary...' : 'End session'}
          </button>

          <button
            type="button"
            disabled={clearDisabled}
            onClick={() => void onClear()}
            className="min-h-[48px] w-full rounded-full px-5 text-[14px] transition-opacity disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
            style={{
              background: 'transparent',
              border: '1px solid color-mix(in oklab, var(--color-line) 88%, transparent)',
              color: 'var(--color-ink-soft)',
            }}
          >
            Clear
          </button>

          <button
            type="button"
            disabled={demoDisabled}
            onClick={() => void onRunDemo()}
            className="min-h-[48px] w-full rounded-full px-5 text-[14px] transition-opacity disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
            style={{
              background: 'var(--color-accent-surface)',
              border: '1px solid color-mix(in oklab, var(--color-amber) 26%, transparent)',
              color: 'var(--color-amber-deep)',
            }}
          >
            {demoRunning ? 'Running demo...' : 'Demo'}
          </button>

          {demoMode && sessionCost != null && (
            <div className="rounded-full px-4 py-2 text-[12px] tabular-nums text-[var(--color-ink-soft)]">
              session cost ${sessionCost.toFixed(2)}
            </div>
          )}
        </div>

        <p
          className="max-w-[500px] text-center text-[13px] leading-relaxed"
          style={{ color: 'var(--color-ink-soft)' }}
        >
          {statusMessage({
            connection,
            orchestrator,
            micPermission,
            pushToTalkActive,
            sessionStarted,
            cognitiveStatus: cognitive.status,
            demoRunning,
          })}
        </p>
      </div>
    </div>
  );
}

function statusMessage({
  connection,
  orchestrator,
  micPermission,
  pushToTalkActive,
  sessionStarted,
  cognitiveStatus,
  demoRunning,
}: {
  connection: ReturnType<typeof useSage.getState>['connection'];
  orchestrator: ReturnType<typeof useSage.getState>['orchestrator'];
  micPermission: ReturnType<typeof useSage.getState>['micPermission'];
  pushToTalkActive: boolean;
  sessionStarted: boolean;
  cognitiveStatus: ReturnType<typeof useSage.getState>['cognitive']['status'];
  demoRunning: boolean;
}) {
  if (micPermission === 'denied') {
    return 'Microphone access is turned off for Sage right now.';
  }
  if (demoRunning) {
    return 'Sage is running the full live demo now, including voice and browser steps.';
  }
  if (pushToTalkActive) {
    return 'Sage is listening. Release the button, or lift the spacebar, when you are done speaking.';
  }
  if (cognitiveStatus === 'loading') {
    return 'Sage is turning this session into a caregiver-ready summary now.';
  }
  if (connection !== 'connected') {
    return 'Waiting for Sage to reconnect before the next turn.';
  }
  if (orchestrator !== 'ready') {
    return 'Sage is connected and ready to talk. If a web task takes a moment, Sage will keep trying in the background.';
  }
  if (sessionStarted) {
    return 'Press and hold space, or hold the button, to continue the conversation.';
  }
  return 'Press and hold space, or use the button, to begin.';
}
