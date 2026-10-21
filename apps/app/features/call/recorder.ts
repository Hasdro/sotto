/**
 * Call recording (owner, 21 Oct 2026): keeps the call's 16 kHz PCM16 frames, the customer's side
 * and, on the desktop, the agent's microphone, and mixes them into one WAV file at the end. Only
 * the recording is made from the agent's microphone; it never reaches speech-to-text (R4).
 * Where the browser can (web and desktop), StreamRecorder records Opus instead: the two live
 * streams mixed and encoded by MediaRecorder, about 11 MB per hour instead of ~115 MB for WAV
 * (owner, 22 Oct). The WAV Recorder stays as the fallback.
 */
import { TARGET_RATE } from "./mic";

export type Track = "customer" | "agent";

/** What the call screen needs from a recorder, whichever kind it is. */
export interface CallRecorder {
  /** PCM frames (the WAV recorder uses them; the Opus one ignores them). */
  add(track: Track, pcm: ArrayBuffer): void;
  /** The live stream (the Opus recorder mixes it; the WAV one ignores it). */
  attach(track: Track, stream: MediaStream | undefined): void;
  /** The finished file, or null when nothing was recorded. */
  finish(): Promise<Blob | null>;
}

export class Recorder implements CallRecorder {
  private readonly tracks: Record<Track, Int16Array[]> = { customer: [], agent: [] };

  add(track: Track, pcm: ArrayBuffer): void {
    this.tracks[track].push(new Int16Array(pcm.slice(0)));
  }

  attach(): void {}

  async finish(): Promise<Blob | null> {
    return this.empty ? null : new Blob([this.wav()], { type: "audio/wav" });
  }

  get empty(): boolean {
    return this.tracks.customer.length === 0 && this.tracks.agent.length === 0;
  }

  /** Both sides mixed into one mono WAV file, raised to a comfortable listening level. */
  wav(): Uint8Array<ArrayBuffer> {
    return encodeWav(louder(mix(join(this.tracks.customer), join(this.tracks.agent))));
  }
}

function join(frames: Int16Array[]): Int16Array {
  const out = new Int16Array(frames.reduce((n, f) => n + f.length, 0));
  let at = 0;
  for (const f of frames) {
    out.set(f, at);
    at += f.length;
  }
  return out;
}

/** Sums two tracks sample by sample, clipped; the shorter one is padded with silence. */
export function mix(a: Int16Array, b: Int16Array): Int16Array {
  const out = new Int16Array(Math.max(a.length, b.length));
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.max(-0x8000, Math.min(0x7fff, (a[i] ?? 0) + (b[i] ?? 0)));
  }
  return out;
}

/** Raises a quiet recording so its loudest moment is near full scale; at most 8 times louder,
 * so near-silence is not turned into hiss. */
export function louder(samples: Int16Array, maxGain = 8): Int16Array {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const gain = peak === 0 ? 1 : Math.min(maxGain, 29000 / peak);
  if (gain <= 1) return samples;
  return samples.map((s) => Math.round(s * gain));
}

/** A 16-bit mono PCM WAV file. */
export function encodeWav(samples: Int16Array, rate = TARGET_RATE): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(44 + samples.length * 2));
  const v = new DataView(bytes.buffer);
  const ascii = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
  };
  ascii(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, samples[i] ?? 0, true);
  return bytes;
}

type Recorderish = {
  start: (timesliceMs?: number) => void;
  stop: () => void;
  state: string;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
};
type RecorderCtor = (new (
  stream: MediaStream,
  opts: { mimeType: string; audioBitsPerSecond: number },
) => Recorderish) & { isTypeSupported?: (t: string) => boolean };

export const OPUS = "audio/webm;codecs=opus";

/** Opus recorder: both sides mixed in an AudioContext, the customer raised a little (the
 * computer's sound comes in quiet), encoded at 24 kbit/s. */
export class StreamRecorder implements CallRecorder {
  private readonly ctx: AudioContext;
  private readonly out: MediaStreamAudioDestinationNode;
  private readonly rec: Recorderish;
  private readonly chunks: Blob[] = [];
  private readonly sources: MediaStreamAudioSourceNode[] = [];
  private started = false;

  static available(): boolean {
    const g = globalThis as { MediaRecorder?: RecorderCtor; AudioContext?: unknown };
    return Boolean(g.AudioContext && g.MediaRecorder?.isTypeSupported?.(OPUS));
  }

  constructor() {
    const g = globalThis as unknown as {
      MediaRecorder: RecorderCtor;
      AudioContext: new () => AudioContext;
    };
    this.ctx = new g.AudioContext();
    this.out = this.ctx.createMediaStreamDestination();
    this.rec = new g.MediaRecorder(this.out.stream, { mimeType: OPUS, audioBitsPerSecond: 24_000 });
    this.rec.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
  }

  add(): void {}

  attach(track: Track, stream: MediaStream | undefined): void {
    if (!stream?.getAudioTracks().length) return;
    const src = this.ctx.createMediaStreamSource(stream);
    const gain = this.ctx.createGain();
    gain.gain.value = track === "customer" ? 2.5 : 1;
    const limit = this.ctx.createDynamicsCompressor(); // keeps the raised side from clipping
    src.connect(gain).connect(limit).connect(this.out);
    this.sources.push(src);
    if (!this.started) {
      this.started = true;
      if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
      this.rec.start(5000); // a chunk every 5 s, so a crash loses at most that
    }
  }

  finish(): Promise<Blob | null> {
    if (!this.started) {
      void this.ctx.close();
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      this.rec.onstop = () => {
        for (const s of this.sources) s.disconnect();
        void this.ctx.close();
        resolve(this.chunks.length ? new Blob(this.chunks, { type: "audio/webm" }) : null);
      };
      this.rec.stop();
    });
  }
}

/** The best recorder this device has. */
export function newRecorder(): CallRecorder {
  return StreamRecorder.available() ? new StreamRecorder() : new Recorder();
}
