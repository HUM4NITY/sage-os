import { useEffect, useRef } from 'react';
import { on } from './socket';
import { useSage } from './store';

type StableBytes = Uint8Array<ArrayBuffer>;
type ChunkPayload = {
  url?: string;
  b64?: string;
};

export function useTtsPlayback() {
  const playerRef = useRef<StreamingTtsPlayer | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const getPlayer = () => {
      if (!playerRef.current) {
        playerRef.current = new StreamingTtsPlayer((level) => {
          const store = useSage.getState();
          store.setSpeakerLevel(level);
          if (level > 0.02 && store.orb !== 'speaking') {
            store.setOrb('speaking');
          }
        });
      }
      return playerRef.current;
    };

    const offChunk = on('tts:chunk', (payload) => {
      chainRef.current = chainRef.current.then(async () => {
        const bytes = await resolveChunk(payload);
        if (!bytes) return;
        await getPlayer().enqueue(bytes);
      });
    });

    const offDone = on('tts:done', () => {
      chainRef.current = chainRef.current.then(async () => {
        if (!playerRef.current) return;
        await playerRef.current.finish();
      });
    });

    const offSessionEnd = on('session:end', () => {
      playerRef.current?.stop();
    });
    const onLocalSessionEnd = () => playerRef.current?.stop();
    window.addEventListener('sage:session-end', onLocalSessionEnd);

    return () => {
      offChunk();
      offDone();
      offSessionEnd();
      window.removeEventListener('sage:session-end', onLocalSessionEnd);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);
}

class StreamingTtsPlayer {
  private audioContext: AudioContext | null = null;
  private audio: HTMLAudioElement | null = null;
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private mediaElementSource: MediaElementAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private timeDomain: StableBytes | null = null;
  private meterFrame = 0;
  private playbackStarted = false;
  private streamFinished = false;
  private queue: StableBytes[] = [];
  private appendedChunks = 0;
  private fallbackChunks: StableBytes[] = [];
  private usingFallback = false;
  private objectUrl: string | null = null;
  private readonly setLevel: (level: number) => void;

  constructor(setLevel: (level: number) => void) {
    this.setLevel = setLevel;
  }

  async enqueue(bytes: Uint8Array) {
    await this.ensureStream();
    const stableBytes = normalizeBytes(bytes);

    if (this.usingFallback) {
      this.fallbackChunks.push(stableBytes);
      return;
    }

    this.queue.push(stableBytes);
    this.flushQueue();
  }

  async finish() {
    this.streamFinished = true;

    if (this.usingFallback) {
      await this.playFallback();
      return;
    }

    this.flushQueue();
    if (!this.playbackStarted && this.appendedChunks > 0) {
      await this.startPlayback();
    }
  }

  stop() {
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
    }
    this.stopMeter();
    this.cleanupGraph();
    this.revokeUrl();
    this.reset();
    this.setLevel(0);
  }

  destroy() {
    this.stop();
    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }
  }

  private async ensureStream() {
    if (this.audio) return;

    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.autoplay = false;
    this.audio.addEventListener('ended', this.handleEnded);

    this.audioContext = new AudioContext({ latencyHint: 'interactive' });
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch {
        // Electron usually permits autoplay after the initial push-to-talk.
      }
    }

    this.mediaElementSource = this.audioContext.createMediaElementSource(this.audio);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    this.timeDomain = normalizeBytes(new Uint8Array(this.analyser.frequencyBinCount));
    this.mediaElementSource.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);

    if (!('MediaSource' in window) || !MediaSource.isTypeSupported('audio/mpeg')) {
      this.usingFallback = true;
      return;
    }

    this.mediaSource = new MediaSource();
    this.objectUrl = URL.createObjectURL(this.mediaSource);
    this.audio.src = this.objectUrl;

    await new Promise<void>((resolve) => {
      this.mediaSource?.addEventListener(
        'sourceopen',
        () => {
          if (!this.mediaSource) {
            resolve();
            return;
          }

          this.sourceBuffer = this.mediaSource.addSourceBuffer('audio/mpeg');
          this.sourceBuffer.mode = 'sequence';
          this.sourceBuffer.addEventListener('updateend', this.flushQueue);
          resolve();
        },
        { once: true },
      );
    });
  }

  private flushQueue = () => {
    if (this.usingFallback || !this.sourceBuffer || this.sourceBuffer.updating) return;

    const next = this.queue.shift();
    if (next) {
      this.appendedChunks += 1;
      this.fallbackChunks.push(next);
      this.sourceBuffer.appendBuffer(
        next.buffer.slice(next.byteOffset, next.byteOffset + next.byteLength),
      );
      if (!this.playbackStarted && this.appendedChunks >= 2) {
        void this.startPlayback();
      }
      return;
    }

    if (this.streamFinished && this.mediaSource?.readyState === 'open') {
      if (!this.playbackStarted && this.appendedChunks > 0) {
        void this.startPlayback();
      }
      try {
        this.mediaSource.endOfStream();
      } catch {
        // ignore double-close races
      }
    }
  };

  private async startPlayback() {
    if (!this.audio || this.playbackStarted) return;
    this.playbackStarted = true;

    try {
      await this.audio.play();
      this.startMeter();
    } catch {
      this.playbackStarted = false;
    }
  }

  private async playFallback() {
    if (!this.audio || this.fallbackChunks.length === 0) return;

    if (!this.objectUrl) {
      const blob = new Blob(this.fallbackChunks, { type: 'audio/mpeg' });
      this.objectUrl = URL.createObjectURL(blob);
    }
    this.audio.src = this.objectUrl;
    await this.startPlayback();
  }

  private startMeter() {
    this.stopMeter();
    let smoothed = 0;

    const tick = () => {
      if (!this.analyser || !this.timeDomain) return;

      this.analyser.getByteTimeDomainData(this.timeDomain);
      let sum = 0;
      for (let i = 0; i < this.timeDomain.length; i++) {
        const normalized = (this.timeDomain[i] - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / this.timeDomain.length);
      smoothed = smoothed * 0.78 + Math.min(1, rms * 2.8) * 0.22;
      this.setLevel(smoothed);
      this.meterFrame = window.requestAnimationFrame(tick);
    };

    this.meterFrame = window.requestAnimationFrame(tick);
  }

  private stopMeter() {
    if (this.meterFrame) {
      window.cancelAnimationFrame(this.meterFrame);
      this.meterFrame = 0;
    }
  }

  private handleEnded = () => {
    this.setLevel(0);
    const store = useSage.getState();
    if (store.orb === 'speaking') {
      store.setOrb('complete');
      window.setTimeout(() => {
        if (useSage.getState().orb === 'complete') {
          useSage.getState().setOrb('idle');
        }
      }, 1200);
    }
    this.stopMeter();
    this.cleanupGraph();
    this.revokeUrl();
    this.reset();
  };

  private cleanupGraph() {
    if (this.sourceBuffer) {
      this.sourceBuffer.removeEventListener('updateend', this.flushQueue);
    }
    this.sourceBuffer = null;
    this.mediaElementSource?.disconnect();
    this.analyser?.disconnect();
    this.mediaElementSource = null;
    this.analyser = null;
    this.timeDomain = null;
  }

  private revokeUrl() {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  private reset() {
    this.mediaSource = null;
    this.queue = [];
    this.appendedChunks = 0;
    this.fallbackChunks = [];
    this.usingFallback = false;
    this.playbackStarted = false;
    this.streamFinished = false;
    if (this.audio) {
      this.audio.removeEventListener('ended', this.handleEnded);
    }
    this.audio = null;
  }
}

async function resolveChunk(payload: ChunkPayload): Promise<Uint8Array | null> {
  if (payload.b64) {
    return decodeBase64(payload.b64);
  }

  if (payload.url) {
    const response = await fetch(payload.url);
    if (!response.ok) return null;
    return normalizeBytes(new Uint8Array(await response.arrayBuffer()));
  }

  return null;
}

function decodeBase64(value: string) {
  const normalized = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value;
  const binary = window.atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return normalizeBytes(bytes);
}

function normalizeBytes(bytes: Uint8Array): StableBytes {
  return Uint8Array.from(bytes) as StableBytes;
}
