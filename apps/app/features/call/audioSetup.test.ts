/** ZC-08: audio auto-setup — OS default mic, 5 s level check on both tracks, remembered per device. */
import { DEFAULT_PREFS } from "../../lib/prefs";
import {
  CHECK_MS,
  checkFix,
  deviceKey,
  pickMic,
  rememberCheck,
  rememberedCheck,
  rms,
  runLevelCheck,
} from "./audioSetup";
import { type MicHandle, MicUnavailable } from "./mic";

const frame = (amp: number) =>
  Int16Array.from({ length: 320 }, (_, i) => (i % 2 ? amp : -amp)).buffer;

describe("audio auto-setup (ZC-08)", () => {
  beforeEach(() => globalThis.localStorage?.clear());

  it("auto pick-up is on by default", () => {
    expect(DEFAULT_PREFS.autoPickup).toBe(true);
  });

  it("measures the level of a PCM16 frame", () => {
    expect(rms(frame(0))).toBe(0);
    expect(rms(frame(16384))).toBeCloseTo(0.5, 2);
  });

  it("follows the OS default microphone unless the chosen one is still plugged in", () => {
    const devices = [
      { kind: "audioinput", deviceId: "default" },
      { kind: "audioinput", deviceId: "usb-1" },
      { kind: "audiooutput", deviceId: "spk" },
    ];
    expect(pickMic(devices, null)).toBeNull();
    expect(pickMic(devices, "usb-1")).toBe("usb-1");
    expect(pickMic(devices, "gone")).toBeNull(); // unplugged: silently back to the default
    expect(pickMic(devices, "spk")).toBeNull(); // not an input
  });

  it("checks both tracks separately, never as one mixed track", async () => {
    const opened: string[] = [];
    const sinks: Record<string, (pcm: ArrayBuffer) => void> = {};
    const stops: jest.Mock[] = [];
    const capture = jest.fn(
      async (source: "computer" | "mic", onFrame: (p: ArrayBuffer) => void) => {
        opened.push(source);
        sinks[source] = onFrame;
        const stop = jest.fn();
        stops.push(stop);
        return { stop } as MicHandle;
      },
    );
    const levels: { customer: number; agent: number }[] = [];
    const result = await runLevelCheck({
      computer: true,
      capture,
      onLevel: (l) => levels.push(l),
      wait: async (ms) => {
        expect(ms).toBe(CHECK_MS);
        sinks.computer?.(frame(8000)); // the call's sound
        sinks.mic?.(frame(0)); // a muted microphone
      },
      now: () => 42,
    });
    expect(opened.sort()).toEqual(["computer", "mic"]);
    expect(capture).toHaveBeenCalledTimes(2);
    // Each track has its own sink: the customer's level never includes the microphone.
    expect(levels.at(-1)?.customer).toBeGreaterThan(0.2);
    expect(levels.at(-1)?.agent).toBe(0);
    expect(result).toEqual({ customer: "ok", agent: "silent", at: 42 });
    for (const s of stops) expect(s).toHaveBeenCalled();
  });

  it("in the browser only the microphone is checked", async () => {
    const capture = jest.fn(
      async (_s: "computer" | "mic", _f: (p: ArrayBuffer) => void) =>
        ({ stop: jest.fn() }) as MicHandle,
    );
    const result = await runLevelCheck({
      computer: false,
      capture,
      wait: async () => {},
      now: () => 1,
    });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0]?.[0]).toBe("mic");
    expect(result.customer).toBe("skipped");
  });

  it("reports a blocked track and gives one plain-language fix with the right OS pane", async () => {
    const capture = jest.fn(async (source: "computer" | "mic") => {
      if (source === "computer") throw new MicUnavailable("denied");
      return { stop: jest.fn() } as MicHandle;
    });
    const result = await runLevelCheck({
      computer: true,
      capture,
      wait: async () => {},
      now: () => 1,
    });
    expect(result.customer).toBe("denied");
    expect(checkFix(result)).toEqual({ text: "check.fix.systemDenied", pane: "system-audio" });
    expect(checkFix({ customer: "ok", agent: "denied", at: 1 })).toEqual({
      text: "check.fix.micDenied",
      pane: "mic",
    });
    expect(checkFix({ customer: "silent", agent: "ok", at: 1 })?.text).toBe(
      "check.fix.systemSilent",
    );
    expect(checkFix({ customer: "ok", agent: "silent", at: 1 })?.text).toBe("check.fix.micSilent");
    expect(checkFix({ customer: "ok", agent: "ok", at: 1 })).toBeNull();
    expect(checkFix({ customer: "skipped", agent: "ok", at: 1 })).toBeNull();
  });

  it("remembers the result per device", () => {
    const usb = deviceKey("usb-1", true);
    const builtIn = deviceKey(null, true);
    expect(usb).not.toBe(builtIn);
    rememberCheck(usb, { customer: "ok", agent: "ok", at: 5 });
    expect(rememberedCheck(usb)).toEqual({ customer: "ok", agent: "ok", at: 5 });
    expect(rememberedCheck(builtIn)).toBeNull();
    expect(rememberedCheck(deviceKey("usb-1", false))).toBeNull(); // browser ≠ desktop app
  });
});
