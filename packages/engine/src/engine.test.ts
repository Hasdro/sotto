import { DemoServerMessage } from "@sotto/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "./__tests__/bundle.json" with { type: "json" };
import { checkKeyHost, DemoModel, makeLLM, OpenAIChat, sseData } from "./adapters/llm.ts";
import { openStt, type SocketLike } from "./adapters/stt.ts";
import { buildRuntime, type CallSummary, KEEP_WARM_EVERY_MS, LocalCallBridge } from "./call.ts";
import { matchText, PlaybookIndex } from "./playbook.ts";
import { AllProvidersFailed, ModelRouter, type RouteResult } from "./router.ts";
import { CallSession } from "./session.ts";
import { CustomerAudio, EndOfTurnVAD, midThought } from "./spoken.ts";
import { classify, renderPrompt, VerdictParser } from "./turns.ts";
import type { CallBundle, LLMAdapter, LLMRequest, TranscriptEvent } from "./types.ts";
import { realClock } from "./types.ts";

const bundle = fixture.bundle as unknown as CallBundle;

/** Fake timers for one test: its waits are instant and exact, so the suite is fast and never
 * flakes on a busy machine (T-043). One spoken-turn test keeps real timers end to end. */
function fakeTime() {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance", "Date"],
  });
}
const pass = (ms: number) => vi.advanceTimersByTimeAsync(ms);
afterEach(() => {
  vi.useRealTimers();
});
const REQ: LLMRequest = {
  system: "",
  messages: [{ role: "user", content: "hi" }],
  max_tokens: 50,
  temperature: 0,
  settings: {},
};

describe("playbook", () => {
  const entry = (id: string, question: string, short_answer: string, tags: string[]) => ({
    id,
    kind: "faq",
    question,
    short_answer,
    details: "",
    follow_up: "",
    tags,
  });
  // Six alike entries: a question naming all six keywords scores ≈ 0.40 against each — below the
  // 0.42 bar, so no playbook card — and on equal scores the first three are the three nearest.
  const SIX = [
    entry("deposit", "Deposit terms?", "Ten percent on booking.", ["deposit"]),
    entry("cards", "Card terms?", "Visa, Mastercard and Amex.", ["card"]),
    entry("due", "Instalment terms?", "On the first of each month.", ["instalment"]),
    entry("gym", "Gym terms?", "Yes, on the roof.", ["gym"]),
    entry("pool", "Pool terms?", "Yes, heated.", ["pool"]),
    entry("parking", "Parking terms?", "One covered space.", ["parking"]),
  ];
  const ASK = "Deposit by card, instalments, and do the gym, pool and parking cost extra?";

  it("gives the model the three nearest entries when no entry is a confident match", async () => {
    const index = new PlaybookIndex(SIX);
    expect(index.lookup(ASK)).toBeNull();
    const seen: LLMRequest[] = [];
    const capture: LLMAdapter = {
      provider: "fake",
      model: "capture",
      warm: async () => {},
      async *stream(req) {
        seen.push(req);
        yield "ANSWER: Visa works for the deposit.";
      },
    };
    const prompt = bundle.prompts.suggest;
    if (!prompt) throw new Error("fixture has the suggest prompt");
    const session = new CallSession({
      callId: "c",
      company: { ...bundle.company, ai_answers_allowed: true },
      router: new ModelRouter(
        { suggest: { provider: "fake", model: "capture" } },
        () => capture,
        realClock,
      ),
      prompt,
      playbook: index,
      clock: realClock,
      onCard: () => {},
      onEscalation: () => {},
      onTiming: () => {},
    });
    session.onTranscript(
      { speaker: "customer", text: ASK, final: true, start_ms: 0, end_ms: 2000 },
      realClock.now(),
    );
    await session.drain();
    expect(seen).toHaveLength(1);
    const text = `${seen[0]?.system}\n${seen[0]?.messages.map((m) => m.content).join("\n")}`;
    for (const e of SIX.slice(0, 3)) {
      expect(text).toContain(e.question);
      expect(text).toContain(e.short_answer);
    }
    expect(text).not.toContain("Gym terms?");
  });

  it("caps the entries given to the model at about 600 characters", () => {
    const long = "word ".repeat(300).trim();
    const index = new PlaybookIndex(SIX.map((e) => ({ ...e, details: long })));
    const text = matchText(index.ranked(ASK, 3));
    expect(text.length).toBeLessThanOrEqual(600);
    expect(text).toContain("Deposit terms?");
  });

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
  it("classifies every customer sentence, never the agent's (R4; owner, 21 Oct)", () => {
    expect(classify(ev("customer", "What's the payment plan?"))).toBe("question");
    expect(classify(ev("customer", "That's too expensive"))).toBe("objection");
    expect(classify(ev("customer", "Yes, I saw your ad."))).toBe("statement");
    expect(classify(ev("customer", "Sounds good, how do I sign up?"))).toBe("signal");
    expect(classify(ev("customer", "I'm not interested, thanks"))).toBe("objection");
    expect(classify(ev("customer", "متى نبدأ؟"))).toBe("signal");
    expect(classify(ev("agent", "What's the payment plan?"))).toBeNull();
    expect(classify(ev("customer", "كم السعر؟"))).toBe("question");
  });
  it("skips fillers and two-word acknowledgements", () => {
    for (const filler of ["Okay.", "Yes", "Uh huh", "Mm-hmm, right", "I see.", "تمام", "طيب"])
      expect(classify(ev("customer", filler))).toBeNull();
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
  seen: LLMRequest[] = [];
  readonly provider: string;
  private readonly opts: { delay?: number; text?: string; fail?: boolean };
  constructor(provider: string, opts: { delay?: number; text?: string; fail?: boolean }) {
    this.provider = provider;
    this.opts = opts;
  }
  async warm() {}
  async *stream(req: LLMRequest, signal: AbortSignal) {
    this.calls += 1;
    this.seen.push(req);
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

describe("a card for every customer sentence (owner, 21 Oct)", () => {
  function run(reply: string, ai = true) {
    const cards: { type: string; source: string; done: boolean }[] = [];
    const escalations: unknown[] = [];
    const model: LLMAdapter = {
      provider: "fake",
      model: "scripted",
      warm: async () => {},
      async *stream() {
        yield reply;
      },
    };
    const prompt = bundle.prompts.suggest;
    if (!prompt) throw new Error("fixture has the suggest prompt");
    const session = new CallSession({
      callId: "c",
      company: { ...bundle.company, ai_answers_allowed: ai },
      router: new ModelRouter(
        { suggest: { provider: "fake", model: "scripted" } },
        () => model,
        realClock,
      ),
      prompt,
      playbook: new PlaybookIndex([]),
      clock: realClock,
      onCard: (c) => cards.push(c as (typeof cards)[number]),
      onEscalation: (e) => escalations.push(e),
      onTiming: () => {},
    });
    const say = async (text: string) => {
      session.onTranscript(
        { speaker: "customer", text, final: true, start_ms: 0, end_ms: 1 },
        realClock.now(),
      );
      await session.drain();
    };
    return { cards, escalations, say };
  }
  it("suggests what to say next after a plain statement, in the 'ask next' colour", async () => {
    const r = run("ANSWER: Ask what made the ad stand out to them.");
    await r.say("We saw your ad last week on Instagram.");
    expect(r.cards.filter((c) => c.done).map((c) => [c.type, c.source])).toEqual([
      ["question", "ai"],
    ]);
  });
  it("gives a buying signal its own card", async () => {
    const r = run("ANSWER: Great — shall I send the agreement now?");
    await r.say("Sounds good, how do I sign up?");
    expect(r.cards.filter((c) => c.done).map((c) => c.type)).toEqual(["signal"]);
  });
  it("never holds or escalates a statement the model passes on", async () => {
    const r = run("NO_SAFE_ANSWER");
    await r.say("My brother bought one from you last year.");
    expect(r.cards).toEqual([]);
    expect(r.escalations).toEqual([]);
  });
  it("still holds and escalates an unanswered question (R2)", async () => {
    const r = run("NO_SAFE_ANSWER");
    await r.say("Do you allow pets?");
    expect(r.cards.filter((c) => c.done).map((c) => c.type)).toEqual(["holding"]);
    expect(r.escalations).toHaveLength(1);
  });
});

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
  it("gives each model its own settings, not the primary's (T-019)", async () => {
    const p = new Scripted("p", { delay: 400, text: "P" });
    const b = new Scripted("b", { text: "B" });
    const r = new ModelRouter(
      {
        suggest: {
          provider: "p",
          model: "m",
          first_token_ms: 60,
          settings: { max_tokens: 300, temperature: 0.2, reasoning_effort: "low" },
        },
        suggest_backup: {
          provider: "b",
          model: "m",
          first_token_ms: 60,
          settings: { max_tokens: 120, temperature: 0.1, reasoning_effort: "none" },
        },
      },
      (route) => (route.provider === "p" ? p : b),
      realClock,
    );
    expect(await collect(r, {})).toBe("B");
    expect(p.seen[0]).toMatchObject({ max_tokens: 300, settings: { reasoning_effort: "low" } });
    expect(b.seen[0]).toMatchObject({
      max_tokens: 120,
      temperature: 0.1,
      settings: { reasoning_effort: "none" },
    });
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
    fakeTime();
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
    await pass(2200);
    bridge.handle({ type: "end" });
    await pass(50);
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
  it("reads a short lead-in sentence together with the question that follows it (T-019)", async () => {
    fakeTime();
    const sent: unknown[] = [];
    const bridge = new LocalCallBridge({
      runtime: buildRuntime(bundle),
      send: (m) => sent.push(DemoServerMessage.parse(m)),
      onEnded: () => {},
    });
    bridge.handle({
      type: "say",
      speaker: "customer",
      text: "My wife worries about the noise from the main road.",
    });
    bridge.handle({ type: "say", speaker: "customer", text: "What would you tell her?" });
    await pass(2200);
    bridge.handle({ type: "end" });
    await pass(50);
    const msgs = sent as { type: string; question?: string; speaker?: string }[];
    const escalations = msgs.filter((m) => m.type === "escalation").map((m) => m.question);
    expect(escalations).toEqual([
      "My wife worries about the noise from the main road. What would you tell her?",
    ]);
    // The transcript still shows what was said, line by line.
    expect(msgs.filter((m) => m.type === "transcript")).toHaveLength(2);
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
  it("keeps the model warm no more often than the HTTP keep-alive (rate-limit quota)", () => {
    // Every warm ping spends the company's own vendor quota (Groq free tier: ~30 requests/min).
    expect(KEEP_WARM_EVERY_MS).toBeGreaterThanOrEqual(120_000);
  });
  it("tells the agent in plain words when real AI or the backup is off (no key names)", () => {
    const none = buildRuntime({ ...bundle, keys: {} });
    expect(none.notes).toEqual(["Real AI answers are off — ask your admin to connect a model."]);
    const noBackup = buildRuntime({ ...bundle, keys: { GROQ_API_KEY: "k" } });
    expect(noBackup.notes).toEqual([
      "The backup AI is off — ask your admin to connect a second model.",
    ]);
    for (const note of [...none.notes, ...noBackup.notes]) expect(note).not.toMatch(/_API_KEY/);
  });
  it("says plainly when speech-to-text is not connected (no key names)", async () => {
    const msgs: DemoServerMessage[] = [];
    const runtime = buildRuntime({ ...bundle, keys: {} });
    const bridge = new LocalCallBridge({ runtime, send: (m) => msgs.push(m) });
    bridge.handle({ type: "audio_start", sample_rate: 16000 });
    await new Promise((r) => setTimeout(r, 0));
    const errors = msgs.filter((m) => m.type === "error").map((m) => m.message);
    expect(errors).toEqual(["Speech-to-text is off — ask your admin to connect it."]);
    bridge.close();
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
  it("sends audio kept while connecting in chunks AssemblyAI accepts (≤ 1 s)", async () => {
    let sock: FakeSocket | null = null;
    const stream = await openStt(
      { provider: "assemblyai", model: "m" },
      async () => ({ token: "t", param: "token" }),
      { onEvent: () => {}, onError: () => {} },
      (url) => {
        sock = new FakeSocket(url);
        return sock;
      },
    );
    for (let i = 0; i < 70; i++) stream.send(new ArrayBuffer(640)); // 1.4 s before open
    const s = sock as unknown as FakeSocket;
    s.open();
    stream.finalize();
    const chunks = s.sent.filter((d): d is ArrayBuffer => d instanceof ArrayBuffer);
    expect(chunks.reduce((n, c) => n + c.byteLength, 0)).toBe(70 * 640);
    expect(Math.max(...chunks.map((c) => c.byteLength))).toBeLessThanOrEqual(32_000);
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

  it("releases a sentence-ending final at once, but waits for a final without punctuation", async () => {
    fakeTime();
    let sock: FakeSocket | null = null;
    const turns: string[] = [];
    const audio = new CustomerAudio({
      routes: [{ provider: "assemblyai", model: "m" }],
      tokens: async () => ({ token: "t", param: "token" }),
      clock: realClock,
      onTurn: (e) => turns.push(e.text),
      onPartial: () => {},
      onNotice: () => {},
      socketFactory: (url) => {
        sock = new FakeSocket(url);
        return sock;
      },
    });
    await audio.start();
    const s = sock as unknown as FakeSocket;
    s.open();
    const turn = (transcript: string, start: number) => {
      for (let i = 0; i < 40; i++) audio.push(loud());
      for (let i = 0; i < 20; i++) audio.push(quiet());
      s.emit({
        type: "Turn",
        transcript,
        end_of_turn: true,
        turn_is_formatted: true,
        words: [{ start, end: start + 700 }],
      });
    };
    turn("Is there parking?", 10);
    expect(turns).toEqual(["Is there parking?"]); // no settle wait (T-028)
    turn("what about storage", 1300);
    expect(turns).toHaveLength(1); // no punctuation: the tail wait still applies
    await pass(450);
    expect(turns).toEqual(["Is there parking?", "what about storage"]);
    await audio.stop();
  });

  it("sends one turn with t0 at the end of speech", async () => {
    // Real timers on purpose: one end-to-end check that audio becomes a turn on a real clock.
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

describe("spoken turns: audio from before the vendor connects (T-019)", () => {
  const loud = () => new Int16Array(320).fill(3000).buffer;
  const quiet = () => new Int16Array(320).buffer;
  const sentMs = (s: FakeSocket) =>
    s.sent.reduce((n, d) => n + (d instanceof ArrayBuffer ? d.byteLength : 0), 0) / 32;
  const final = (text: string, start: number, end: number) => ({
    type: "Turn",
    transcript: text,
    end_of_turn: true,
    turn_is_formatted: true,
    words: [{ start, end }],
  });

  it("keeps the first words and a second sentence close behind the first", async () => {
    fakeTime();
    let sock: FakeSocket | null = null;
    const turns: string[] = [];
    const audio = new CustomerAudio({
      routes: [{ provider: "assemblyai", model: "m" }],
      tokens: async () => ({ token: "t", param: "token" }),
      clock: realClock,
      onTurn: (e) => turns.push(e.text),
      onPartial: () => {},
      onNotice: () => {},
      socketFactory: (url) => {
        sock = new FakeSocket(url);
        return sock;
      },
    });
    // The microphone runs for 1.5 s while the token is fetched and the socket opens.
    const started = audio.start();
    for (let i = 0; i < 75; i++) audio.push(quiet());
    await started;
    const s = sock as unknown as FakeSocket;
    s.open();
    for (let i = 0; i < 40; i++) audio.push(loud());
    for (let i = 0; i < 20; i++) audio.push(quiet()); // end of turn sends the batch
    const first = sentMs(s) - 1200; // where this sentence starts on the vendor's clock
    s.emit(final("My wife worries about the noise from the main road.", first, first + 800));
    await pass(250);
    for (let i = 0; i < 40; i++) audio.push(loud());
    for (let i = 0; i < 20; i++) audio.push(quiet());
    const second = sentMs(s) - 1200;
    s.emit(final("What would you tell her?", second, second + 800));
    await pass(250);
    expect(turns).toEqual([
      "My wife worries about the noise from the main road.",
      "What would you tell her?",
    ]);
    expect(first).toBeGreaterThanOrEqual(1400); // the 1.5 s before the socket opened was sent
    await audio.stop();
  });

  it("joins a sentence the vendor cut after a dangling word", async () => {
    fakeTime();
    let sock: FakeSocket | null = null;
    const turns: string[] = [];
    const audio = new CustomerAudio({
      routes: [{ provider: "assemblyai", model: "m" }],
      tokens: async () => ({ token: "t", param: "token" }),
      clock: realClock,
      onTurn: (e) => turns.push(e.text),
      onPartial: () => {},
      onNotice: () => {},
      socketFactory: (url) => {
        sock = new FakeSocket(url);
        return sock;
      },
    });
    await audio.start();
    const s = sock as unknown as FakeSocket;
    s.open();
    for (let i = 0; i < 40; i++) audio.push(loud());
    for (let i = 0; i < 20; i++) audio.push(quiet());
    s.emit(final("Is parking included with the.", 0, 600));
    await pass(220); // the vendor's tail arrives after the settle time
    s.emit(final("Apartment?", 700, 800));
    await pass(700);
    expect(turns).toEqual(["Is parking included with the apartment?"]);
    expect(midThought("Is parking included with the.")).toBe(true);
    expect(midThought("Is it included?")).toBe(false);
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
