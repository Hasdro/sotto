/**
 * Audio in → PCM16 mono 16 kHz frames of 20 ms. Two sources (D-024):
 * - "computer": the Mac or PC's own sound output, i.e. the other side of a Zoom, Google Meet or
 *   softphone (Yeastar, 3CX) call. Exact customer isolation (R4): your own voice is never played
 *   back through your speakers. Desktop app only (Electron answers getDisplayMedia with loopback).
 * - "mic": the microphone, for in-person or speakerphone calls. Approximate (R4): it can also hear
 *   you. Echo cancellation and noise suppression stay on.
 * Web only; phone calls get their audio from LiveKit in Phase 4.
 */

export const TARGET_RATE = 16000;
export const FRAME_SAMPLES = 320; // 20 ms at 16 kHz

/** Averages input samples down to 16 kHz and packs PCM16 frames. Pure; exported for tests. */
export class Downsampler {
  private readonly ratio: number;
  private carry: number[] = [];
  private acc = 0;
  private accCount = 0;
  private pos = 0;

  constructor(inputRate: number) {
    if (inputRate < TARGET_RATE) throw new Error(`input rate ${inputRate} is below 16 kHz`);
    this.ratio = inputRate / TARGET_RATE;
  }

  /** Feeds float samples in [-1, 1]; returns finished 20 ms frames. */
  push(input: Float32Array): ArrayBuffer[] {
    const out: ArrayBuffer[] = [];
    for (let i = 0; i < input.length; i++) {
      this.acc += input[i] ?? 0;
      this.accCount++;
      this.pos++;
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio;
        const v = Math.max(-1, Math.min(1, this.acc / this.accCount));
        this.carry.push(v < 0 ? Math.round(v * 0x8000) : Math.round(v * 0x7fff));
        this.acc = 0;
        this.accCount = 0;
        if (this.carry.length === FRAME_SAMPLES) {
          out.push(Int16Array.from(this.carry).buffer);
          this.carry = [];
        }
      }
    }
    return out;
  }
}

export type MicError = "unsupported" | "denied";
export type AudioSource = "computer" | "mic";
export type MicHandle = { stop: () => void };

type AudioContextCtor = new () => AudioContext;

type Browser = {
  navigator?: { mediaDevices?: MediaDevices; userAgent?: string };
  AudioContext?: AudioContextCtor;
  webkitAudioContext?: AudioContextCtor;
  isSecureContext?: boolean;
};

/** True in the Sotto desktop app, which can hear the computer's own sound output. */
export function computerAudioAvailable(): boolean {
  const g = globalThis as Browser;
  return (
    Boolean(g.navigator?.mediaDevices?.getDisplayMedia) &&
    /\bElectron\//.test(g.navigator?.userAgent ?? "")
  );
}

/** Starts the microphone. Calls onFrame with each 20 ms PCM16 frame until stop(). */
export function startMic(onFrame: (pcm: ArrayBuffer) => void): Promise<MicHandle> {
  return startCapture("mic", onFrame);
}

/** Starts the given source. Calls onFrame with each 20 ms PCM16 frame until stop(). */
export async function startCapture(
  source: AudioSource,
  onFrame: (pcm: ArrayBuffer) => void,
): Promise<MicHandle> {
  const g = globalThis as Browser;
  const Ctx = g.AudioContext ?? g.webkitAudioContext;
  const media = g.navigator?.mediaDevices;
  const api = source === "computer" ? media?.getDisplayMedia : media?.getUserMedia;
  if (!media || !api || !Ctx || g.isSecureContext === false) {
    throw new MicUnavailable("unsupported");
  }
  let stream: MediaStream;
  try {
    stream =
      source === "computer"
        ? await media.getDisplayMedia({
            // The desktop app answers with the screen plus loopback audio; only the audio is kept.
            video: true,
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          })
        : await media.getUserMedia({
            audio: {
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
  } catch {
    throw new MicUnavailable("denied");
  }
  for (const track of stream.getVideoTracks()) track.stop();
  if (stream.getAudioTracks().length === 0) {
    for (const track of stream.getTracks()) track.stop();
    throw new MicUnavailable("denied"); // the system gave no sound (permission not granted)
  }
  const ctx = new Ctx();
  // Safari starts a context created after an await (outside the click) suspended: no frames.
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});
  const input = ctx.createMediaStreamSource(stream);
  const down = new Downsampler(ctx.sampleRate);
  // ScriptProcessorNode is deprecated but runs everywhere without a separate worklet file; the
  // 2048-sample buffer (~43 ms at 48 kHz) is well inside the 300 ms end-of-turn window. Its one
  // input channel mixes stereo call audio down to mono.
  const node = ctx.createScriptProcessor(2048, 1, 1);
  node.onaudioprocess = (ev) => {
    for (const frame of down.push(ev.inputBuffer.getChannelData(0))) onFrame(frame);
  };
  const mute = ctx.createGain();
  mute.gain.value = 0; // keep the graph running without playing the audio back
  input.connect(node);
  node.connect(mute);
  mute.connect(ctx.destination);
  return {
    stop() {
      node.onaudioprocess = null;
      input.disconnect();
      node.disconnect();
      for (const track of stream.getTracks()) track.stop();
      void ctx.close();
    },
  };
}

export class MicUnavailable extends Error {
  constructor(readonly reason: MicError) {
    super(reason);
  }
}
