/** The local call bridge's edges: scenarios, audio, ids (T-042). */
import { DemoServerMessage } from "@sotto/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "./__tests__/bundle.json" with { type: "json" };
import type { SocketLike } from "./adapters/stt.ts";
import { buildRuntime, type CallSummary, LocalCallBridge } from "./call.ts";
import { type CallBundle, newId } from "./types.ts";

const bundle = fixture.bundle as unknown as CallBundle;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function bridge(over: Partial<ConstructorParameters<typeof LocalCallBridge>[0]> = {}) {
  const msgs: DemoServerMessage[] = [];
  let summary: CallSummary | null = null;
  const b = new LocalCallBridge({
    runtime: buildRuntime(bundle),
    send: (m) => msgs.push(DemoServerMessage.parse(m)),
    onEnded: (s) => {
      summary = s;
    },
    ...over,
  });
  return { b, msgs, summary: () => summary };
}

describe("local call bridge", () => {
  it("says so when asked for a scenario it does not have", () => {
    const { b, msgs } = bridge();
    b.handle({ type: "start", scenario_id: "nope" });
    expect(msgs.filter((m) => m.type === "error").map((m) => m.message)).toEqual([
      "unknown scenario",
    ]);
    b.close();
  });

  it("plays a scenario's lines in order, and a new start ends the previous call", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const scenario = bundle.scenarios[0];
    if (!scenario) throw new Error("fixture has a scenario");
    const { b, msgs } = bridge({ speed: 0.01 });
    b.handle({ type: "start", scenario_id: scenario.id });
    await vi.advanceTimersByTimeAsync(5000);
    const said = msgs.filter((m) => m.type === "transcript").map((m) => m.text);
    expect(said.slice(0, 2)).toEqual(scenario.lines.slice(0, 2).map((l) => l.text));
    b.handle({ type: "start", scenario_id: null });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(msgs.filter((m) => m.type === "call_ended")).toHaveLength(1);
    expect(msgs.filter((m) => m.type === "call_started")).toHaveLength(2);
    b.handle({ type: "end" });
    await vi.advanceTimersByTimeAsync(10_000);
  });

  it("ignores stop and end when no call is running", () => {
    const { b, msgs } = bridge();
    b.handle({ type: "audio_stop" });
    b.handle({ type: "end" });
    b.audio(new ArrayBuffer(640));
    expect(msgs.map((m) => m.type)).toEqual(["hello", "notice"]);
  });

  it("hears the customer through the speech vendor and names it in the summary", async () => {
    let sock: (SocketLike & { emit: (m: unknown) => void }) | null = null;
    const runtime = buildRuntime({
      ...bundle,
      keys: { GROQ_API_KEY: "k" },
      key_status: { ASSEMBLYAI_API_KEY: 1 },
    });
    const { b, msgs, summary } = bridge({
      runtime,
      tokens: async () => ({ token: "t", param: "token" }),
      socketFactory: () => {
        const s = {
          readyState: 0,
          binaryType: "",
          onopen: null as ((ev: unknown) => void) | null,
          onclose: null as ((ev: { code?: number; reason?: string }) => void) | null,
          onerror: null,
          onmessage: null as ((ev: { data: unknown }) => void) | null,
          send(d: string | ArrayBuffer) {
            if (typeof d === "string" && d.includes("Terminate")) s.emit({ type: "Termination" });
          },
          close() {},
          emit(m: unknown) {
            s.onmessage?.({ data: JSON.stringify(m) });
          },
        };
        sock = s;
        return s;
      },
    });
    b.handle({ type: "audio_start", sample_rate: 16000 });
    await new Promise((r) => setTimeout(r, 0));
    const s = sock as unknown as { readyState: number; onopen: (e: unknown) => void } & {
      emit: (m: unknown) => void;
    };
    s.readyState = 1;
    s.onopen({});
    b.audio(new Int16Array(320).buffer);
    s.emit({ type: "Turn", transcript: "is there", end_of_turn: false, words: [] });
    expect(msgs.filter((m) => m.type === "partial").map((m) => m.text)).toEqual(["is there"]);
    b.handle({ type: "audio_stop" });
    b.handle({ type: "end" });
    await new Promise((r) => setTimeout(r, 20));
    expect(summary()?.stt_vendor).toBe("assemblyai");
  });
});

describe("ids", () => {
  it("makes v4 UUIDs without randomUUID, and without crypto at all", () => {
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => a.fill(7) });
    expect(newId()).toMatch(UUID);
    vi.stubGlobal("crypto", undefined);
    expect(newId()).toMatch(UUID);
  });
});
