/** The model adapters' edges: key hosts, request shapes, stream parsing, errors (T-042). */
import { describe, expect, it } from "vitest";
import {
  AnthropicChat,
  checkKeyHost,
  DemoModel,
  hasCredentials,
  keyEnvOf,
  MissingKey,
  makeLLM,
  OpenAIChat,
} from "./adapters/llm.ts";
import type { LLMRequest } from "./types.ts";
import { realClock } from "./types.ts";

const REQ: LLMRequest = {
  system: "Be brief.",
  messages: [{ role: "user", content: "hi" }],
  max_tokens: 50,
  temperature: 0.2,
  settings: {},
};

function sse(events: string[], status = 200): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(events.map((e) => `data: ${e}\n\n`).join("")));
      c.close();
    },
  });
  return new Response(body, { status });
}

type Sent = { url: string; init: RequestInit };
function recorder(response: () => Response) {
  const sent: Sent[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    return response();
  }) as unknown as typeof fetch;
  return { sent, fetchFn };
}

const headersOf = (s: Sent | undefined) => (s?.init.headers ?? {}) as Record<string, string>;

async function collect(it: AsyncIterable<string>): Promise<string> {
  let out = "";
  for await (const t of it) out += t;
  return out;
}

describe("key hosts", () => {
  it("refuses unknown keys, user info in the address, and plain http", () => {
    expect(() => checkKeyHost("NOPE_API_KEY", "https://api.groq.com/v1")).toThrow(/not a known/);
    expect(() => checkKeyHost("GROQ_API_KEY", "https://u:p@api.groq.com/v1")).toThrow(/user info/);
    expect(() => checkKeyHost("GROQ_API_KEY", "http://api.groq.com/v1")).toThrow(/https/);
    expect(() => checkKeyHost("GROQ_API_KEY", "https://api.groq.com/openai/v1")).not.toThrow();
  });
  it("names the key each route needs, and whether it is there", () => {
    expect(keyEnvOf({ provider: "openai", model: "m" })).toBe("OPENAI_API_KEY");
    expect(keyEnvOf({ provider: "anthropic", model: "m" })).toBe("ANTHROPIC_API_KEY");
    expect(keyEnvOf({ provider: "openai_compatible", model: "m" })).toBeNull();
    expect(keyEnvOf({ provider: "fake", model: "m" })).toBeNull();
    expect(hasCredentials({ provider: "fake", model: "m" }, {})).toBe(true);
    expect(hasCredentials({ provider: "openai_compatible", model: "m" }, {})).toBe(true);
    expect(hasCredentials({ provider: "openai", model: "m" }, {})).toBe(false);
    expect(hasCredentials({ provider: "openai", model: "m" }, { OPENAI_API_KEY: "k" })).toBe(true);
  });
});

describe("OpenAI-compatible chat", () => {
  it("streams deltas, skips junk lines and stops at [DONE]", async () => {
    const { sent, fetchFn } = recorder(() =>
      sse([
        "not json",
        JSON.stringify({ choices: [{ delta: { content: "Hel" } }] }),
        JSON.stringify({ choices: [{ delta: { content: null } }] }),
        JSON.stringify({ choices: [{ delta: { content: "lo" } }] }),
        "[DONE]",
        JSON.stringify({ choices: [{ delta: { content: "never" } }] }),
      ]),
    );
    const chat = new OpenAIChat("openai_compatible", "m", "https://api.groq.com/v1/", "k", fetchFn);
    const req = { ...REQ, settings: { reasoning_effort: "low" } };
    expect(await collect(chat.stream(req, new AbortController().signal))).toBe("Hello");
    const body = JSON.parse(String(sent[0]?.init.body));
    expect(sent[0]?.url).toBe("https://api.groq.com/v1/chat/completions");
    expect(body.messages[0]).toEqual({ role: "system", content: "Be brief." });
    expect(body).toMatchObject({ max_tokens: 50, temperature: 0.2, reasoning_effort: "low" });
    expect(headersOf(sent[0]).authorization).toBe("Bearer k");
  });
  it("uses max_completion_tokens for OpenAI itself and sends no key header without a key", async () => {
    const { sent, fetchFn } = recorder(() => sse(["[DONE]"]));
    const openai = new OpenAIChat("openai", "m", "https://api.openai.com/v1", "k", fetchFn);
    await collect(openai.stream({ ...REQ, system: "" }, new AbortController().signal));
    const body = JSON.parse(String(sent[0]?.init.body));
    expect(body.max_completion_tokens).toBe(50);
    expect(body.max_tokens).toBeUndefined();
    expect(body.messages).toEqual(REQ.messages);
    const local = new OpenAIChat(
      "openai_compatible",
      "m",
      "http://127.0.0.1:11434/v1",
      null,
      fetchFn,
    );
    await collect(local.stream(REQ, new AbortController().signal));
    expect(headersOf(sent[1]).authorization).toBeUndefined();
  });
  it("reports the vendor's status and a short detail on failure", async () => {
    const { fetchFn } = recorder(() => new Response("rate limited", { status: 429 }));
    const chat = new OpenAIChat("openai_compatible", "m", "https://api.groq.com/v1", "k", fetchFn);
    await expect(collect(chat.stream(REQ, new AbortController().signal))).rejects.toThrow(
      "openai_compatible answered 429: rate limited",
    );
  });
  it("warms the connection and never throws doing so", async () => {
    const { sent, fetchFn } = recorder(() => new Response("{}"));
    await new OpenAIChat("p", "m", "https://api.groq.com/v1", "k", fetchFn).warm();
    expect(sent[0]?.url).toBe("https://api.groq.com/v1/models");
    const broken = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    await expect(new OpenAIChat("p", "m", "https://x.test/v1", null, broken).warm()).resolves.toBe(
      undefined,
    );
  });
});

describe("Anthropic chat", () => {
  it("streams text deltas, caches the system prompt and passes thinking settings", async () => {
    const { sent, fetchFn } = recorder(() =>
      sse([
        "{bad",
        JSON.stringify({ type: "message_start" }),
        JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "Hi" } }),
        JSON.stringify({ type: "content_block_delta", delta: { type: "input_json_delta" } }),
        JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "" } }),
        JSON.stringify({ type: "message_stop" }),
        JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "x" } }),
      ]),
    );
    const chat = new AnthropicChat("claude-model", "k", fetchFn);
    const req = { ...REQ, settings: { thinking: { type: "disabled" } } };
    expect(await collect(chat.stream(req, new AbortController().signal))).toBe("Hi");
    const body = JSON.parse(String(sent[0]?.init.body));
    expect(body.system[0]).toMatchObject({
      text: "Be brief.",
      cache_control: { type: "ephemeral" },
    });
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(headersOf(sent[0])["x-api-key"]).toBe("k");
  });
  it("sends no system block when there is none, and fails on an error event or status", async () => {
    const { sent, fetchFn } = recorder(() => sse([JSON.stringify({ type: "error" })]));
    const chat = new AnthropicChat("m", "k", fetchFn);
    await expect(
      collect(chat.stream({ ...REQ, system: "" }, new AbortController().signal)),
    ).rejects.toThrow("anthropic stream error");
    expect(JSON.parse(String(sent[0]?.init.body)).system).toBeUndefined();
    const down = recorder(() => new Response("", { status: 529 }));
    await expect(
      collect(new AnthropicChat("m", "k", down.fetchFn).stream(REQ, new AbortController().signal)),
    ).rejects.toThrow("anthropic answered 529");
  });
  it("warms without throwing", async () => {
    const broken = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    await expect(new AnthropicChat("m", "k", broken).warm()).resolves.toBe(undefined);
    const ok = recorder(() => new Response("{}"));
    await new AnthropicChat("m", "k", ok.fetchFn).warm();
    expect(ok.sent[0]?.url).toBe("https://api.anthropic.com/v1/models");
  });
});

describe("demo model", () => {
  it("coaches an Arabic objection in Arabic and stops when aborted", async () => {
    const m = new DemoModel(realClock, 0, 0);
    const ar = {
      ...REQ,
      messages: [{ role: "user" as const, content: "Kind of turn: objection in Arabic" }],
    };
    expect(await collect(m.stream(ar, new AbortController().signal))).toMatch(/^ANSWER: أفهمك/);
    const ctrl = new AbortController();
    ctrl.abort();
    expect(await collect(m.stream(REQ, ctrl.signal))).toBe("");
    await expect(m.warm()).resolves.toBe(undefined);
  });
});

describe("makeLLM", () => {
  const route = (provider: string, extra: Record<string, unknown> = {}) => ({
    provider,
    model: "m",
    ...extra,
  });
  it("builds each vendor's adapter only with its key, on its own host", () => {
    expect(makeLLM(route("fake"), {}, realClock)).toBeInstanceOf(DemoModel);
    expect(() => makeLLM(route("anthropic"), {}, realClock)).toThrow(MissingKey);
    expect(makeLLM(route("anthropic"), { ANTHROPIC_API_KEY: "k" }, realClock)).toBeInstanceOf(
      AnthropicChat,
    );
    expect(() => makeLLM(route("openai"), {}, realClock)).toThrow(MissingKey);
    expect(makeLLM(route("openai"), { OPENAI_API_KEY: "k" }, realClock)).toBeInstanceOf(OpenAIChat);
    expect(() =>
      makeLLM(
        route("openai", { base_url: "https://evil.test/v1" }),
        { OPENAI_API_KEY: "k" },
        realClock,
      ),
    ).toThrow(/may only be sent/);
    expect(() => makeLLM(route("openai_compatible"), {}, realClock)).toThrow(/base_url/);
    const groq = route("openai_compatible", {
      base_url: "https://api.groq.com/openai/v1",
      api_key_env: "GROQ_API_KEY",
    });
    expect(() => makeLLM(groq, {}, realClock)).toThrow(MissingKey);
    expect(makeLLM(groq, { GROQ_API_KEY: "k" }, realClock)).toBeInstanceOf(OpenAIChat);
    const ollama = route("openai_compatible", { base_url: "http://127.0.0.1:11434/v1" });
    expect(makeLLM(ollama, {}, realClock)).toBeInstanceOf(OpenAIChat);
    expect(() => makeLLM(route("mystery"), {}, realClock)).toThrow(/unknown provider/);
  });
});
