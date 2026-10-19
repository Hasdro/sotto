import { Downsampler, FRAME_SAMPLES, startMic } from "./mic";

describe("microphone downsampling (D-020)", () => {
  it("turns 48 kHz float audio into 20 ms PCM16 frames at 16 kHz", () => {
    const down = new Downsampler(48000);
    const second = new Float32Array(48000).fill(0.5);
    const frames = down.push(second);
    expect(frames).toHaveLength(50); // 1 s / 20 ms
    const first = new Int16Array(frames[0] as ArrayBuffer);
    expect(first).toHaveLength(FRAME_SAMPLES);
    expect(first[0]).toBe(Math.round(0.5 * 0x7fff));
  });

  it("keeps partial frames between calls and clips out-of-range samples", () => {
    const down = new Downsampler(16000);
    expect(down.push(new Float32Array(300).fill(2))).toHaveLength(0);
    const [frame] = down.push(new Float32Array(20).fill(-2));
    const pcm = new Int16Array(frame as ArrayBuffer);
    expect(pcm[0]).toBe(0x7fff);
    expect(pcm[319]).toBe(-0x8000);
  });

  it("refuses to start where the browser has no microphone API", async () => {
    await expect(startMic(() => {})).rejects.toMatchObject({ reason: "unsupported" });
  });
});
