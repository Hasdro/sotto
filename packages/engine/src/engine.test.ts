import { DemoServerMessage } from "@sotto/shared";
import { describe, expect, it } from "vitest";
import fixture from "./__tests__/bundle.json" with { type: "json" };
import { checkKeyHost, DemoModel, makeLLM, OpenAIChat, sseData } from "./adapters/llm.ts";
import { openStt, type SocketLike } from "./adapters/stt.ts";
import { buildRuntime, type CallSummary, LocalCallBridge } from "./call.ts";
import { PlaybookIndex } from "./playbook.ts";
import { AllProvidersFailed, ModelRouter, type RouteResult } from "./router.ts";
import { CustomerAudio, EndOfTurnVAD, midThought } from "./spoken.ts";
import { classify, renderPrompt, VerdictParser } from "./turns.ts";
import type { CallBundle, LLMAdapter, LLMRequest, TranscriptEvent } from "./types.ts";
import { realClock } from "./types.ts";

const bundle = fixture.bundle as unknown as CallBundle;
const REQ: LLMRequest = {
  system: "",
  messages: [{ role: "user", content: "hi" }],
  max_tokens: 50,
  temperature: 0,
  settings: {},
};

describe("playbook", () => {
  it("picks the same entry as the Python worker for every demo line", () => {
    const index = new PlaybookIndex(bundle.playbook);
    for (const [text, id] of Object.entries(fixture.lookups)) {
      expect(index.lookup(text)?.entry.id ?? null, text).toBe(id);
    }
  });
});

describe("turns", () => {
  const ev = (speaker: "customer" | "agent", text: string): TranscriptEvent => ({
    speaker,
    text,
    final: true,
    start_ms: 0,
    end_ms: 1,
  });
  it("classifies only customer questions and objections (R4)", () => {
    expect(classify(ev("customer", "What's the payment plan?"))).toBe("question");
    expect(classify(ev("customer", "That's too expensive"))).toBe("objection");
    expect(classify(ev("customer", "Yes, I saw your ad."))).toBeNull();
    expect(classify(ev("agent", "What's the payment plan?"))).toBeNull();
    expect(classify(ev("customer", "كم السعر؟"))).toBe("question");
  });
  it("reads the verdict before showing anything", () => {
    const p = new VerdictParser();
    expect(p.feed("ANS")).toBe("");
    expect(p.feed("WER: Sure")).toBe("Sure");
    expect(p.feed(" thing")).toBe(" thing");
    const n = new VerdictParser();
    expect(n.feed("NO_SAFE")).toBe("");
    expect(n.feed("_ANSWER")).toBe("");
    expect(n.verdict).toBe("no_answer");
    const raw = new VerdictParser();
    expect(raw.feed("Happy to help with that")).toBe("Happy to help with that");
  });
  it("renders prompts and refuses missing variables", () => {
    expect(renderPrompt("Hi {{ a.b }}", { "a.b": "x" })).toBe("Hi x");
    expect(() => renderPrompt("{{missing}}", {})).toThrow(/missing/);
  });
});

class Scripted implements LLMAdapter {
  readonly model = "m";
  calls = 0;
  readonly provider: string;
  private readonly opts: { delay?: number; text?: string; fail?: boolean };
  constructor(provider: string, opts: { delay?: number; text?: string; fail?: boolean }) {
    this.provider = provider;
    this.opts = opts;
  }
  async warm() {}
  async *stream(_req: LLMRequest, signal: AbortSignal) {
    this.calls += 1;
    await realClock.sleep(this.opts.delay ?? 0, signal);
    if (signal.aborted) return;
    if (this.opts.fail) throw new Error(`${this.provider} down`);
    yield this.opts.text ?? "ok";
  }
}

async function collect(router: ModelRouter, result: RouteResult): Promise<string> {
  let out = "";
  for await (const t of router.stream("suggest", REQ, { t0: realClock.now(), result })) out += t;
  return out;
}

describe("router (R2 backup race)", () => {
  const stages = {
    suggest: { provider: "p", model: "m", first_token_ms: 60 },
    suggest_backup: { provider: "b", model: "m", first_token_ms: 60 },
  };
  const router = (p: Scripted, b: Scripted) =>
    new ModelRouter(stages, (route) => (route.provider === "p" ? p : b), realClock);

  it("uses the primary when it is fast", async () => {
    const result: RouteResult = {};
    expect(
      await collect(
        router(new Scripted("p", { text: "P" }), new Scripted("b", { text: "B" })),
        result,
      ),
    ).toBe("P");
    expect(result.winner).toBe("primary");
  });
  it("races the backup after the first-token deadline", async () => {
    const result: RouteResult = {};
    const out = await collect(
      router(new Scripted("p", { delay: 400, text: "P" }), new Scripted("b", { text: "B" })),
      result,
    );
    expect(out).toBe("B");
    expect(result.fallbackReason).toBe("timeout");
  });
  it("falls back on an error and fails when both fail", async () => {
    const result: RouteResult = {};
    expect(
      await collect(
        router(new Scripted("p", { fail: true }), new Scripted("b", { text: "B" })),
        result,
      ),
    ).toBe("B");
    expect(result.fallbackReason).toBe("error");
    await expect(
      collect(router(new Scripted("p", { fail: true }), new Scripted("b", { fail: true })), {}),
    ).rejects.toBeInstanceOf(AllProvidersFailed);
  });
  it("opens the circuit after three primary failures", async () => {
    const p = new Scripted("p", { fail: true });
    const r = router(p, new Scripted("b", { text: "B" }));
    for (let i = 0; i < 3; i++) await collect(r, {});
    const result: RouteResult = {};
    await collect(r, result);
    expect(result.fallbackReason).toBe("circuit_open");
    expect(p.calls).toBe(3);
  });
});

function sseResponse(events: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const e of events) c.enqueue(new TextEncoder().encode(e));
      c.close();
    },
  });
  return new Response(body, { status: 200 });
}

describe("model adapters", () => {
  it("streams OpenAI-compatible SSE and sends the key only to its host", async () => {
    let seen: { url: string; auth: string | null; body: Record<string, unknown> } | null = null;
    const fetchFn = (async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      seen = { url, auth: headers.authorization ?? null, body: JSON.parse(String(init.body)) };
      return sseResponse([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\ndata: [DONE]\n\n',
      ]);
    }) as unknown as typeof fetch;
    const llm = makeLLM(
      {
        provider: "openai_compatible",
        model: "x",
        base_url: "https://api.groq.com/openai/v1",
        api_key_env: "GROQ_API_KEY",
        settings: { reasoning_effort: "low" },
      },
      { GROQ_API_KEY: "test-key" },
      realClock,
      fetchFn,
    );
    let out = "";
    for await (const t of llm.stream(
      { ...REQ, settings: { reasoning_effort: "low" } },
      new AbortController().signal,
    ))
      out += t;
    expect(out).toBe("Hello");
    expect(seen).toMatchObject({
      url: "https://api.groq.com/openai/v1/chat/completions",
      auth: "Bearer test-key",
    });
    expect(() => checkKeyHost("GROQ_API_KEY", "https://evil.example.com/v1")).toThrow();
    expect(() => checkKeyHost("GROQ_API_KEY", "http://api.groq.com/v1")).toThrow();
    expect(llm).toBeInstanceOf(OpenAIChat);
  });
  it("parses split SSE frames", async () => {
    const out: string[] = [];
    for await (const d of sseData(
      sseResponse(["data: a", "\n\nda", "ta: b\n\n"]).body as ReadableStream<Uint8Array>,
    ))
      out.push(d);
    expect(out).toEqual(["a", "b"]);
  });
  it("demo model coaches objections and declines facts", async () => {
    const m = new DemoModel(realClock, 1, 0);
    let out = "";
    for await (const t of m.stream(
      { ...REQ, messages: [{ role: "user", content: "Kind of turn: objection." }] },
      new AbortController().signal,
    ))
      out += t;
    expect(out.startsWith("ANSWER:")).toBe(true);
  });
});

describe("local call (demo protocol, offline model)", () => {
  it("answers from the playbook, holds and escalates unknown facts, coaches objections", async () => {
    const sent: unknown[] = [];
    let summary: CallSummary | null = null;
    const runtime = buildRuntime(bundle);
    expect(runtime.mode).toBe("fake");
    const bridge = new LocalCallBridge({
      runtime,
      send: (m) => sent.push(DemoServerMessage.parse(m)),
      onEnded: (s) => {
        summary = s;
      },
    });
    bridge.handle({ type: "say", speaker: "customer", text: "What's the payment plan?" });
    bridge.handle({ type: "say", speaker: "customer", text: "Do you allow pets?" });
    bridge.handle({
      type: "say",
      speaker: "customer",
      text: "Honestly the location is out of our budget.",
    });
    bridge.handle({ type: "say", speaker: "agent", text: "What's the payment plan?" });
    await realClock.sleep(2200);
    bridge.handle({ type: "end" });
    await realClock.sleep(50);
    const msgs = sent as { type: string; card?: { source: string; done: boolean } }[];
    expect(msgs[0]?.type).toBe("hello");
    const done = msgs.filter((m) => m.type === "card" && m.card?.done).map((m) => m.card?.source);
    expect(done).toEqual(expect.arrayContaining(["playbook", "holding", "ai"]));
    expect(done).toHaveLength(3); // the agent's question triggered nothing (R4)
    expect(msgs.filter((m) => m.type === "escalation")).toHaveLength(1);
    expect(msgs.at(-1)?.type).toBe("call_ended");
    expect(summary).toMatchObject({
      cards: 3,
      playbook_cards: 1,
      holding_lines: 1,
      escalations: 1,
    });
  });
  it("turns keys into a live runtime with the backup only when its key exists", () => {
    const live = buildRuntime({ ...bundle, keys: { GROQ_API_KEY: "k" } });
    expect(live.mode).toBe("live");
    expect(live.company.backup_disabled).toContain("suggest_backup");
    const both = buildRuntime({
      ...bundle,
      keys: { GROQ_API_KEY: "k", GEMINI_API_KEY: "g" },
      key_status: { ASSEMBLYAI_API_KEY: 1 },
    });
    expect(both.company.backup_disabled).not.toContain("suggest_backup");
    expect(both.sttRoutes.map((r) => r.provider)).toEqual(["assemblyai"]);
  });
});

class FakeSocket implements SocketLike {
  readyState = 0;
  binaryType = "";
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  sent: (string | ArrayBuffer)[] = [];
  readonly url: string;
  constructor(url: string) {
    this.url = url;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  emit(m: unknown) {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
  send(d: string | ArrayBuffer) {
    this.sent.push(d);
    if (typeof d === "string" && d.includes("Terminate")) this.emit({ type: "Termination" });
  }
  close() {
    this.readyState = 3;
  }
}

describe("speech-to-text (client)", () => {
  it("authenticates with a short-lived token and maps AssemblyAI turns", async () => {
    let sock: FakeSocket | null = null;
    const events: TranscriptEvent[] = [];
    const stream = await openStt(
      { provider: "assemblyai", model: "universal-streaming-english" },
      async () => ({ token: "tmp", param: "token" }),
      {
        onEvent: (e) => events.push(e),
        onError: (e) => {
          throw e;
        },
      },
      (url) => {
        sock = new FakeSocket(url);
        return sock;
      },
    );
    const s = sock as unknown as FakeSocket;
    expect(new URL(s.url).searchParams.get("token")).toBe("tmp");
    s.open();
    for (let i = 0; i < 5; i++) stream.send(new ArrayBuffer(640));
    expect(s.sent.filter((d) => d instanceof ArrayBuffer)).toHaveLength(1); // 100 ms batches
    s.emit({
      type: "Turn",
      transcript: "is there parking",
      end_of_turn: false,
      words: [{ start: 100, end: 900 }],
    });
    s.emit({
      type: "Turn",
      transcript: "Is there parking?",
      end_of_turn: true,
      turn_is_formatted: true,
      words: [{ start: 100, end: 900 }],
    });
    expect(events.map((e) => [e.text, e.final])).toEqual([
      ["is there parking", false],
      ["Is there parking?", true],
    ]);
    await stream.end();
  });
  it("refuses a vendor address on another host", async () => {
    await expect(
      openStt(
        { provider: "assemblyai", model: "m", base_url: "wss://evil.example.com/ws" },
        async () => ({ token: "t", param: "token" }),
        { onEvent: () => {}, onError: () => {} },
      ),
    ).rejects.toThrow(/must go to/);
  });
});

describe("spoken turns", () => {
  const loud = () => new Int16Array(320).fill(3000).buffer;
  const quiet = () => new Int16Array(320).buffer;

  it("detects speech start and end of turn", () => {
    const vad = new EndOfTurnVAD();
    const marks: string[] = [];
    for (let i = 0; i < 20; i++) marks.push(String(vad.feed(new Int16Array(loud()))));
    for (let i = 0; i < 20; i++) marks.push(String(vad.feed(new Int16Array(quiet()))));
    expect(marks.filter((m) => m !== "null")).toEqual(["start", "end"]);
    expect(midThought("tell me about the")).toBe(true);
    expect(midThought("tell me about parking.")).toBe(false);
  });

  it("sends one turn with t0 at the end of speech", async () => {
    let sock: FakeSocket | null = null;
    const turns: [string, number][] = [];
    const audio = new CustomerAudio({
      routes: [{ provider: "assemblyai", model: "m" }],
      tokens: async () => ({ token: "t", param: "token" }),
      clock: realClock,
      onTurn: (e, t0) => turns.push([e.text, t0]),
      onPartial: () => {},
      onNotice: () => {},
      socketFactory: (url) => {
        sock = new FakeSocket(url);
        return sock;
      },
    });
    await audio.start();
    (sock as unknown as FakeSocket).open();
    for (let i = 0; i < 40; i++) audio.push(loud());
    const before = realClock.now();
    for (let i = 0; i < 20; i++) audio.push(quiet());
    (sock as unknown as FakeSocket).emit({
      type: "Turn",
      transcript: "Is there parking?",
      end_of_turn: true,
      turn_is_formatted: true,
      words: [{ start: 10, end: 700 }],
    });
    await realClock.sleep(250);
    expect(turns).toHaveLength(1);
    expect(turns[0]?.[0]).toBe("Is there parking?");
    expect(turns[0]?.[1]).toBeLessThanOrEqual(before);
    await audio.stop();
  });
});

describe("UTF-8 fallback decoder (runtimes without TextDecoder)", () => {
  it("decodes multi-byte text split across chunks", async () => {
    const { makeDecoder } = await import("./adapters/llm.ts");
    const saved = globalThis.TextDecoder;
    Reflect.deleteProperty(globalThis, "TextDecoder"); // a runtime without TextDecoder
    try {
      const d = makeDecoder();
      const bytes = new TextEncoder().encode("سعر – €5 ✓");
      const out =
        d.decode(bytes.slice(0, 3)) + d.decode(bytes.slice(3, 7)) + d.decode(bytes.slice(7));
      expect(out).toBe("سعر – €5 ✓");
    } finally {
      globalThis.TextDecoder = saved;
    }
  });
});
