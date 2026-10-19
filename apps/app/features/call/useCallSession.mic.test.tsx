import { act, renderHook } from "@testing-library/react-native";
import type { SocketFactory } from "./bridge";
import { type MicHandle, startMic } from "./mic";
import { useCallSession } from "./useCallSession";

jest.mock("./devGate", () => ({ demoEnabled: jest.fn(() => true) }));
jest.mock("./mic", () => ({
  ...jest.requireActual("./mic"),
  startMic: jest.fn(),
}));

const CALL = "0b8f3c1e-7a2d-4e6f-8c9b-1d2e3f4a5b6c";

function liveSocket() {
  const sent: unknown[] = [];
  const sock = {
    readyState: 1,
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null as ((ev: { data: unknown }) => void) | null,
    send: (d: string | ArrayBuffer) => sent.push(typeof d === "string" ? JSON.parse(d) : d),
    close: () => {},
  };
  const factory: SocketFactory = () => sock;
  const emit = (msg: object) => sock.onmessage?.({ data: JSON.stringify(msg) });
  return { factory, sent, emit };
}

async function liveCall() {
  const s = liveSocket();
  const hook = await renderHook(() =>
    useCallSession({ mock: false, locale: "en", socketFactory: s.factory }),
  );
  await act(async () => {
    s.emit({
      type: "hello",
      v: 1,
      company_name: "Demo",
      mode: "fake",
      scenarios: [],
      stt_vendor: "AssemblyAI",
    });
    s.emit({ type: "call_started", call_id: CALL });
  });
  return { ...s, ...hook };
}

describe("microphone (D-020)", () => {
  it("stopping while the browser asks for permission lets the late grant go", async () => {
    let grant: (h: MicHandle) => void = () => {};
    jest.mocked(startMic).mockReturnValue(new Promise((resolve) => (grant = resolve)));
    const { result, sent } = await liveCall();
    await act(async () => result.current.toggleMic());
    expect(result.current.mic).toBe("starting");
    await act(async () => result.current.toggleMic()); // stop before the prompt is answered
    expect(result.current.mic).toBe("off");
    const handle = { stop: jest.fn() };
    await act(async () => grant(handle));
    expect(handle.stop).toHaveBeenCalled();
    expect(result.current.mic).toBe("off");
    expect(sent.filter((m) => typeof m === "object" && m !== null && "type" in m)).toEqual([
      { type: "audio_start", sample_rate: 16000 },
      { type: "audio_stop" },
    ]);
  });

  it("reports a blocked microphone and tells the server to stop", async () => {
    const { MicUnavailable } = jest.requireActual("./mic");
    jest.mocked(startMic).mockRejectedValue(new MicUnavailable("denied"));
    const { result, sent } = await liveCall();
    await act(async () => result.current.toggleMic());
    expect(result.current.mic).toBe("denied");
    expect(sent.at(-1)).toEqual({ type: "audio_stop" });
  });

  it("streams frames while on and stops when the call ends", async () => {
    let onFrame: (pcm: ArrayBuffer) => void = () => {};
    const handle = { stop: jest.fn() };
    jest.mocked(startMic).mockImplementation(async (cb) => {
      onFrame = cb;
      return handle;
    });
    const { result, sent, emit } = await liveCall();
    await act(async () => result.current.toggleMic());
    expect(result.current.mic).toBe("on");
    const frame = new ArrayBuffer(640);
    onFrame(frame);
    expect(sent).toContain(frame);
    await act(async () => emit({ type: "call_ended", call_id: CALL }));
    expect(handle.stop).toHaveBeenCalled();
    expect(result.current.mic).toBe("off");
  });
});
