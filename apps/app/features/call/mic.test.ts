import { computerAudioAvailable, Downsampler, FRAME_SAMPLES, startCapture, startMic } from "./mic";

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

  it("refuses the computer's sound outside the desktop app", async () => {
    expect(computerAudioAvailable()).toBe(false);
    await expect(startCapture("computer", () => {})).rejects.toMatchObject({
      reason: "unsupported",
    });
  });
});

describe("the computer's sound (D-024)", () => {
  const g = globalThis as { navigator?: unknown; AudioContext?: unknown };
  const saved = { navigator: g.navigator, AudioContext: g.AudioContext };
  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", { value: saved.navigator, configurable: true });
    g.AudioContext = saved.AudioContext;
  });

  function fakeBrowser(userAgent: string, audioTracks: number) {
    const video = { stop: jest.fn() };
    const audio = Array.from({ length: audioTracks }, () => ({ stop: jest.fn() }));
    const stream = {
      getVideoTracks: () => [video],
      getAudioTracks: () => audio,
      getTracks: () => [video, ...audio],
    };
    const getDisplayMedia = jest.fn(async () => stream);
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent, mediaDevices: { getDisplayMedia, getUserMedia: jest.fn() } },
      configurable: true,
    });
    const node = () => ({ connect: jest.fn(), disconnect: jest.fn() });
    g.AudioContext = class {
      state = "running";
      sampleRate = 48000;
      destination = {};
      createMediaStreamSource = node;
      createScriptProcessor = node;
      createGain = () => ({ ...node(), gain: { value: 1 } });
      close = jest.fn(async () => {});
    };
    return { getDisplayMedia, video, audio };
  }

  it("is offered only inside the desktop app", () => {
    fakeBrowser("Mozilla/5.0 Chrome/140", 1);
    expect(computerAudioAvailable()).toBe(false);
    fakeBrowser("Mozilla/5.0 Chrome/140 Electron/44.5.1", 1);
    expect(computerAudioAvailable()).toBe(true);
  });

  it("keeps only the sound and drops the screen picture at once", async () => {
    const b = fakeBrowser("Electron/44.5.1", 1);
    const handle = await startCapture("computer", () => {});
    expect(b.getDisplayMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: expect.objectContaining({ echoCancellation: false }) }),
    );
    expect(b.video.stop).toHaveBeenCalled();
    handle.stop();
    expect(b.audio[0]?.stop).toHaveBeenCalled();
  });

  it("reports a blocked permission when the system gives no sound", async () => {
    fakeBrowser("Electron/44.5.1", 0);
    await expect(startCapture("computer", () => {})).rejects.toMatchObject({ reason: "denied" });
  });
});
