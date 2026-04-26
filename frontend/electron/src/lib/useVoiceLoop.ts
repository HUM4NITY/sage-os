import { useCallback, useEffect, useRef } from 'react';
import { socket } from './socket';
import { useSage } from './store';

const MAX_TURN_MS = 12_000;
const PATIENT_ID = import.meta.env.VITE_PATIENT_ID ?? 'p_eleanor';

const MIC_WORKLET_SOURCE = `
class SageMicWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetRate = 16000;
    this.chunkSize = 4000;
    this.buffer = [];
    this.port.onmessage = (event) => {
      if (event.data && event.data.type === 'flush') {
        this.flush();
        return;
      }
      if (event.data && event.data.type === 'reset') {
        this.buffer = [];
      }
    };
  }

  downsample(input, inputRate, outputRate) {
    if (outputRate >= inputRate) {
      return input.slice();
    }

    const ratio = inputRate / outputRate;
    const newLength = Math.floor(input.length / ratio);
    const output = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < output.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < input.length; i++) {
        accum += input[i];
        count++;
      }
      output[offsetResult] = count > 0 ? accum / count : 0;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }

    return output;
  }

  emitChunk(samples) {
    const pcm = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    const payload = pcm.buffer;
    this.port.postMessage({ type: 'chunk', buffer: payload }, [payload]);
  }

  flush() {
    if (this.buffer.length === 0) return;
    const samples = Float32Array.from(this.buffer.splice(0, this.buffer.length));
    this.emitChunk(samples);
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel || channel.length === 0) return true;

    const mono = this.downsample(channel, sampleRate, this.targetRate);
    for (let i = 0; i < mono.length; i++) {
      this.buffer.push(mono[i]);
      if (this.buffer.length >= this.chunkSize) {
        const chunk = Float32Array.from(this.buffer.splice(0, this.chunkSize));
        this.emitChunk(chunk);
      }
    }

    return true;
  }
}

registerProcessor('sage-mic-worklet', SageMicWorklet);
`;

type VoiceLoopApi = {
  beginTalk: () => Promise<void>;
  endTalk: () => Promise<void>;
  endSession: () => Promise<void>;
};

export function useVoiceLoop(): VoiceLoopApi {
  const sessionStarted = useSage((s) => s.sessionStarted);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const muteGainRef = useRef<GainNode | null>(null);
  const connectedRef = useRef(false);
  const activeRef = useRef(false);
  const stopTimerRef = useRef<number | null>(null);
  const sessionStartedRef = useRef(useSage.getState().sessionStarted);

  useEffect(() => {
    sessionStartedRef.current = sessionStarted;
  }, [sessionStarted]);

  const clearStopTimer = useCallback(() => {
    if (stopTimerRef.current != null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  }, []);

  const ensureAudioGraph = useCallback(async () => {
    if (audioContextRef.current && streamRef.current && sourceRef.current && workletRef.current) {
      return true;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      const audioContext = new AudioContext({ latencyHint: 'interactive' });
      const blobUrl = URL.createObjectURL(
        new Blob([MIC_WORKLET_SOURCE], { type: 'application/javascript' }),
      );
      try {
        await audioContext.audioWorklet.addModule(blobUrl);
      } finally {
        URL.revokeObjectURL(blobUrl);
      }

      const source = audioContext.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(audioContext, 'sage-mic-worklet', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      const muteGain = audioContext.createGain();
      muteGain.gain.value = 0;

      worklet.connect(muteGain);
      muteGain.connect(audioContext.destination);

      worklet.port.onmessage = (event: MessageEvent<{ type: string; buffer?: ArrayBuffer }>) => {
        if (event.data?.type === 'chunk' && event.data.buffer) {
          socket.emit('audio:chunk', event.data.buffer);
        }
      };

      audioContextRef.current = audioContext;
      streamRef.current = stream;
      sourceRef.current = source;
      workletRef.current = worklet;
      muteGainRef.current = muteGain;
      useSage.getState().setMicPermission('granted', null);
      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Sage needs the microphone to listen. Please allow it in system settings.';
      useSage.getState().setMicPermission('denied', message);
      useSage.getState().setPushToTalkActive(false);
      useSage.getState().setOrb('idle');
      return false;
    }
  }, []);

  const endTalk = useCallback(async () => {
    if (!activeRef.current) return;

    activeRef.current = false;
    clearStopTimer();

    const store = useSage.getState();
    store.setPushToTalkActive(false);
    store.setSpeakerLevel(0);

    const source = sourceRef.current;
    const worklet = workletRef.current;

    if (source && worklet && connectedRef.current) {
      try {
        source.disconnect(worklet);
      } catch {
        // no-op
      }
      connectedRef.current = false;
      worklet.port.postMessage({ type: 'flush' });
      await wait(20);
      worklet.port.postMessage({ type: 'reset' });
    }

    if (store.orb === 'listening') {
      store.setOrb('thinking');
    }

    socket.emit('audio:end');
  }, [clearStopTimer]);

  const beginTalk = useCallback(async () => {
    if (activeRef.current) return;
    const store = useSage.getState();
    if (store.connection !== 'connected') return;

    const ready = await ensureAudioGraph();
    if (!ready) return;

    const audioContext = audioContextRef.current;
    const source = sourceRef.current;
    const worklet = workletRef.current;
    if (!audioContext || !source || !worklet) return;

    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    if (!sessionStartedRef.current) {
      socket.emit('session:start', { patient_id: PATIENT_ID });
      store.setSessionStarted(true);
      sessionStartedRef.current = true;
    }

    worklet.port.postMessage({ type: 'reset' });
    if (!connectedRef.current) {
      source.connect(worklet);
      connectedRef.current = true;
    }

    activeRef.current = true;
    store.setPushToTalkActive(true);
    store.setMicPermission('granted', null);
    store.setSpeakerLevel(0);
    store.setOrb('listening');

    clearStopTimer();
    stopTimerRef.current = window.setTimeout(() => {
      void endTalk();
    }, MAX_TURN_MS);
  }, [clearStopTimer, endTalk, ensureAudioGraph]);

  const endSession = useCallback(async () => {
    const store = useSage.getState();
    if (activeRef.current) {
      await endTalk();
    }
    if (!sessionStartedRef.current) return;

    socket.emit('session:end');
    window.dispatchEvent(new CustomEvent('sage:session-end'));
    sessionStartedRef.current = false;
    store.setSessionStarted(false);
    store.beginAnalysis();
    store.setOrb('complete');

    window.setTimeout(() => {
      if (useSage.getState().orb === 'complete') {
        useSage.getState().setOrb('idle');
      }
    }, 1400);
  }, [endTalk]);

  useEffect(() => {
    return () => {
      clearStopTimer();
      activeRef.current = false;

      const source = sourceRef.current;
      const worklet = workletRef.current;
      if (source && worklet && connectedRef.current) {
        try {
          source.disconnect(worklet);
        } catch {
          // no-op
        }
      }
      connectedRef.current = false;
      worklet?.disconnect();
      muteGainRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      sourceRef.current = null;
      workletRef.current = null;
      muteGainRef.current = null;

      const audioContext = audioContextRef.current;
      audioContextRef.current = null;
      if (audioContext) {
        void audioContext.close();
      }
    };
  }, [clearStopTimer]);

  return { beginTalk, endTalk, endSession };
}

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}
