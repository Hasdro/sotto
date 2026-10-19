/**
 * Browser microphone → PCM16 mono 16 kHz frames of 20 ms (D-020: "speak as the customer" on the
 * demo). Web only; native calls get their audio from LiveKit in Phase 4. Echo cancellation and
 * noise suppression stay on, so the agent's own speakers are not heard as the customer.
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
export type MicHandle = { stop: () => void };

type AudioContextCtor = new () => AudioContext;

/** Starts the microphone. Calls onFrame with each 20 ms PCM16 frame until stop(). */
export async function startMic(onFrame: (pcm: ArrayBuffer) => void): Promise<MicHandle> {
  const g = globalThis as {
    navigator?: { mediaDevices?: MediaDevices };
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
    isSecureContext?: boolean;
  };
  const Ctx = g.AudioContext ?? g.webkitAudioContext;
  if (!g.navigator?.mediaDevices?.getUserMedia || !Ctx || g.isSecureContext === false) {
    throw new MicUnavailable("unsupported");
  }
  let stream: MediaStream;
  try {
    stream = await g.navigator.mediaDevices.getUserMedia({
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
  const ctx = new Ctx();
  const source = ctx.createMediaStreamSource(stream);
  const down = new Downsampler(ctx.sampleRate);
  // ScriptProcessorNode is deprecated but runs everywhere without a separate worklet file; the
  // 2048-sample buffer (~43 ms at 48 kHz) is well inside the 300 ms end-of-turn window.
  const node = ctx.createScriptProcessor(2048, 1, 1);
  node.onaudioprocess = (ev) => {
    for (const frame of down.push(ev.inputBuffer.getChannelData(0))) onFrame(frame);
  };
  const mute = ctx.createGain();
  mute.gain.value = 0; // keep the graph running without playing the mic back
  source.connect(node);
  node.connect(mute);
  mute.connect(ctx.destination);
  return {
    stop() {
      node.onaudioprocess = null;
      source.disconnect();
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
