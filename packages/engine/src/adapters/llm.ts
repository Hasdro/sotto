/**
 * Model adapters for the client engine (D-022), over plain `fetch` + server-sent events, no SDK:
 * OpenAI Chat Completions (also any OpenAI-compatible endpoint: Groq, Gemini's OpenAI endpoint,
 * OpenRouter, Ollama…), Anthropic Messages, and the offline demo model.
 *
 * Each key only ever goes to its own vendor's host over https (D-016), checked before sending.
 * Docs: platform.openai.com/docs/api-reference/chat/create (stream), docs.claude.com streaming.
 */
import type { Clock, LLMAdapter, LLMRequest, StageRoute } from "../types.ts";

/** The one host each platform key may be sent to (sotto_worker/adapters/factory.py). */
export const KEY_HOSTS: Record<string, string> = {
  GROQ_API_KEY: "api.groq.com",
  GEMINI_API_KEY: "generativelanguage.googleapis.com",
  OPENROUTER_API_KEY: "openrouter.ai",
  OPENAI_API_KEY: "api.openai.com",
  ANTHROPIC_API_KEY: "api.anthropic.com",
  CEREBRAS_API_KEY: "api.cerebras.ai",
};
const OPENAI_BASE = "https://api.openai.com/v1";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export type Fetch = typeof fetch;

export class MissingKey extends Error {}

export function checkKeyHost(keyEnv: string, url: string): void {
  const host = KEY_HOSTS[keyEnv];
  if (!host) throw new Error(`${keyEnv} is not a known provider key`);
  const u = new URL(url);
  if (u.username || u.password) throw new Error(`${keyEnv}: the address must not carry user info`);
  if (u.hostname !== host) throw new Error(`${keyEnv} may only be sent to ${host}`);
  if (u.protocol !== "https:") throw new Error(`${keyEnv} may only be sent over https`);
}

/** The env name a route needs, or null when it needs no secret (local endpoint, fake). */
export function keyEnvOf(route: StageRoute): string | null {
  if (route.provider === "openai_compatible") return route.api_key_env ?? null;
  if (route.provider === "openai") return "OPENAI_API_KEY";
  if (route.provider === "anthropic") return "ANTHROPIC_API_KEY";
  return null;
}

export function hasCredentials(route: StageRoute, keys: Record<string, string>): boolean {
  if (route.provider === "fake") return true;
  const name = keyEnvOf(route);
  return name === null || Boolean(keys[name]);
}

/** Parses an SSE byte stream into `data:` payloads (one per event). */
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let data: string[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += done ? "\n" : decoder.decode(value, { stream: true });
      let nl = buffer.indexOf("\n");
      while (nl >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, "");
        buffer = buffer.slice(nl + 1);
        if (line === "") {
          if (data.length) yield data.join("\n");
          data = [];
        } else if (line.startsWith("data:")) {
          data.push(line.slice(5).replace(/^ /, ""));
        }
        nl = buffer.indexOf("\n");
      }
      if (done) {
        if (data.length) yield data.join("\n");
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function failure(res: Response, vendor: string): Promise<Error> {
  let detail = "";
  try {
    const text = await res.text();
    detail = text.slice(0, 200);
  } catch {
    /* body unreadable */
  }
  return new Error(`${vendor} answered ${res.status}${detail ? `: ${detail}` : ""}`);
}

export class OpenAIChat implements LLMAdapter {
  private readonly url: string;
  private readonly modelsUrl: string;

  readonly provider: string;

  readonly model: string;

  private readonly key: string | null;

  private readonly fetchFn: Fetch;

  constructor(
    provider: string,
    model: string,
    baseUrl: string,
    key: string | null,
    fetchFn: Fetch = (...a) => fetch(...a),
  ) {
    this.provider = provider;

    this.model = model;

    this.key = key;

    this.fetchFn = fetchFn;
    const base = baseUrl.replace(/\/+$/, "");
    this.url = `${base}/chat/completions`;
    this.modelsUrl = `${base}/models`;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (this.key) h.authorization = `Bearer ${this.key}`;
    return h;
  }

  async warm(): Promise<void> {
    try {
      await this.fetchFn(this.modelsUrl, { headers: this.headers() });
    } catch {
      /* warming is best effort */
    }
  }

  async *stream(req: LLMRequest, signal: AbortSignal): AsyncIterable<string> {
    const messages = [
      ...(req.system ? [{ role: "system", content: req.system }] : []),
      ...req.messages,
    ];
    const body: Record<string, unknown> = { model: this.model, messages, stream: true };
    if (this.provider === "openai") body.max_completion_tokens = req.max_tokens;
    else {
      body.max_tokens = req.max_tokens;
      body.temperature = req.temperature;
    }
    if ("reasoning_effort" in req.settings) body.reasoning_effort = req.settings.reasoning_effort;
    const res = await this.fetchFn(this.url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok || !res.body) throw await failure(res, this.provider);
    for await (const data of sseData(res.body)) {
      if (data === "[DONE]") return;
      let parsed: { choices?: { delta?: { content?: string | null } }[] };
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }
      const text = parsed.choices?.[0]?.delta?.content;
      if (text) yield text;
    }
  }
}

export class AnthropicChat implements LLMAdapter {
  readonly provider = "anthropic";

  readonly model: string;

  private readonly key: string;

  private readonly fetchFn: Fetch;

  constructor(model: string, key: string, fetchFn: Fetch = (...a) => fetch(...a)) {
    this.model = model;

    this.key = key;

    this.fetchFn = fetchFn;
  }

  private headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      "x-api-key": this.key,
      "anthropic-version": ANTHROPIC_VERSION,
      // The key belongs to the company's own account and is used from its agents' devices (D-022).
      "anthropic-dangerous-direct-browser-access": "true",
    };
  }

  async warm(): Promise<void> {
    try {
      await this.fetchFn("https://api.anthropic.com/v1/models", { headers: this.headers() });
    } catch {
      /* best effort */
    }
  }

  async *stream(req: LLMRequest, signal: AbortSignal): AsyncIterable<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: req.max_tokens,
      stream: true,
      messages: req.messages,
    };
    if (req.system) {
      body.system = [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }];
    }
    if ("thinking" in req.settings) body.thinking = req.settings.thinking;
    const res = await this.fetchFn(ANTHROPIC_URL, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok || !res.body) throw await failure(res, "anthropic");
    for await (const data of sseData(res.body)) {
      let parsed: { type?: string; delta?: { type?: string; text?: string }; error?: unknown };
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }
      if (parsed.type === "error") throw new Error("anthropic stream error");
      if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
        if (parsed.delta.text) yield parsed.delta.text;
      }
      if (parsed.type === "message_stop") return;
    }
  }
}

/** Offline demo model (as sotto_worker demo_fake_text): objections get a generic coaching line;
 * factual questions without a playbook entry get NO_SAFE_ANSWER → holding line + inbox (R2). */
export class DemoModel implements LLMAdapter {
  readonly provider = "fake";
  readonly model = "demo";

  private readonly clock: Clock;
  private readonly firstTokenMs: number;
  private readonly chunkMs: number;

  constructor(clock: Clock, firstTokenMs = 350, chunkMs = 45) {
    this.clock = clock;
    this.firstTokenMs = firstTokenMs;
    this.chunkMs = chunkMs;
  }

  async warm(): Promise<void> {}

  async *stream(req: LLMRequest, signal: AbortSignal): AsyncIterable<string> {
    await this.clock.sleep(this.firstTokenMs, signal);
    if (signal.aborted) return;
    const prompt = (req.messages.at(-1)?.content ?? "") + req.system;
    const text = prompt.includes("Kind of turn: objection")
      ? prompt.includes("in Arabic")
        ? "ANSWER: أفهمك تماماً. ما الذي يجعل هذا القرار مريحاً لك؟"
        : "ANSWER: I hear you. What would make this feel like the right decision for you?"
      : "NO_SAFE_ANSWER";
    const words = text.split(" ");
    for (let i = 0; i < words.length; i++) {
      if (i) await this.clock.sleep(this.chunkMs, signal);
      if (signal.aborted) return;
      yield i === 0 ? (words[i] as string) : ` ${words[i]}`;
    }
  }
}

/** The adapter for a route, with the key checked against its host (D-016). */
export function makeLLM(
  route: StageRoute,
  keys: Record<string, string>,
  clock: Clock,
  fetchFn?: Fetch,
): LLMAdapter {
  if (route.provider === "fake") return new DemoModel(clock);
  if (route.provider === "anthropic") {
    const key = keys.ANTHROPIC_API_KEY;
    if (!key) throw new MissingKey("ANTHROPIC_API_KEY is not set");
    return new AnthropicChat(route.model, key, fetchFn);
  }
  if (route.provider === "openai") {
    const key = keys.OPENAI_API_KEY;
    if (!key) throw new MissingKey("OPENAI_API_KEY is not set");
    const base = route.base_url ?? OPENAI_BASE;
    checkKeyHost("OPENAI_API_KEY", base);
    return new OpenAIChat("openai", route.model, base, key, fetchFn);
  }
  if (route.provider === "openai_compatible") {
    if (!route.base_url) throw new Error("an OpenAI-compatible route needs base_url");
    let key: string | null = null;
    if (route.api_key_env) {
      key = keys[route.api_key_env] ?? null;
      if (!key) throw new MissingKey(`${route.api_key_env} is not set`);
      checkKeyHost(route.api_key_env, route.base_url);
    }
    return new OpenAIChat("openai_compatible", route.model, route.base_url, key, fetchFn);
  }
  throw new Error(`unknown provider ${route.provider}`);
}
