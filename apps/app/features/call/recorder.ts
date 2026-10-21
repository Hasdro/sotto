/**
 * Call recording (owner, 21 Oct 2026): keeps the call's 16 kHz PCM16 frames, the customer's side
 * and, on the desktop, the agent's microphone, and mixes them into one WAV file at the end. Only
 * the recording is made from the agent's microphone; it never reaches speech-to-text (R4).
 * shortcut: frames stay in memory (~115 MB per hour of call); stream to disk if calls run longer.
 */
import { TARGET_RATE } from "./mic";

export type Track = "customer" | "agent";

export class Recorder {
  private readonly tracks: Record<Track, Int16Array[]> = { customer: [], agent: [] };

  add(track: Track, pcm: ArrayBuffer): void {
    this.tracks[track].push(new Int16Array(pcm.slice(0)));
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
