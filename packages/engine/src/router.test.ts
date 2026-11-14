/**
 * ZC-06: while AGN has demoted a stage's vendor for everyone, the router asks the backup first;
 * the primary is the last try; primary failures are reported for the server's circuit. The R2
 * backup race itself is unchanged (engine.test.ts "router (R2 backup race)").
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  AllProvidersFailed,
  isDemoted,
  ModelRouter,
  type PlatformRoute,
  type PrimaryFailure,
  type RouteResult,
  setFailureReporter,
} from "./router.ts";
import { type LLMAdapter, type LLMRequest, realClock } from "./types.ts";

const REQ: LLMRequest = {
  system: "",
  messages: [{ role: "user", content: "hi" }],
  max_tokens: 50,
  temperature: 0,
  settings: {},
};

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

function stages(demotedUntil?: number): Record<string, PlatformRoute> {
  return {
    suggest: {
      provider: "p",
      model: "m",
      first_token_ms: 60,
      vendor: "groq",
      ...(demotedUntil === undefined ? {} : { demoted_until: demotedUntil }),
    },
    suggest_backup: { provider: "b", model: "m", first_token_ms: 60, vendor: "gemini" },
  };
}

async function collect(router: ModelRouter, result: RouteResult): Promise<string> {
  let out = "";
  for await (const t of router.stream("suggest", REQ, { t0: realClock.now(), result })) out += t;
  return out;
}

afterEach(() => setFailureReporter(null));

describe("platform demotion (ZC-06)", () => {
  it("uses the backup first while the primary's vendor is demoted", async () => {
    const p = new Scripted("p", { text: "P" });
    const b = new Scripted("b", { text: "B" });
    const r = new ModelRouter(
      stages(Date.now() + 60_000),
      (route) => (route.provider === "p" ? p : b),
      realClock,
    );
    const result: RouteResult = {};
    expect(await collect(r, result)).toBe("B");
    expect(result.winner).toBe("backup");
    expect(result.fallbackReason).toBe("demoted");
    expect(p.calls).toBe(0);
  });

  it("goes back to the primary once the demotion has ended", async () => {
    const p = new Scripted("p", { text: "P" });
    const b = new Scripted("b", { text: "B" });
    const r = new ModelRouter(
      stages(Date.now() - 1),
      (route) => (route.provider === "p" ? p : b),
      realClock,
    );
    const result: RouteResult = {};
    expect(await collect(r, result)).toBe("P");
    expect(result.winner).toBe("primary");
    expect(isDemoted(stages(Date.now() - 1).suggest as PlatformRoute)).toBe(false);
  });

  it("tries the demoted primary when the backup fails, so the agent still gets a card", async () => {
    const p = new Scripted("p", { text: "P" });
    const b = new Scripted("b", { fail: true });
    const r = new ModelRouter(
      stages(Date.now() + 60_000),
      (route) => (route.provider === "p" ? p : b),
      realClock,
    );
    const result: RouteResult = {};
    expect(await collect(r, result)).toBe("P");
    expect(result.winner).toBe("primary");
  });

  it("fails only when both fail", async () => {
    const r = new ModelRouter(
      stages(Date.now() + 60_000),
      (route) => new Scripted(route.provider, { fail: true }),
      realClock,
    );
    await expect(collect(r, {})).rejects.toBeInstanceOf(AllProvidersFailed);
  });

  it("without a backup the demoted primary still runs", async () => {
    const only = { suggest: stages(Date.now() + 60_000).suggest as PlatformRoute };
    const r = new ModelRouter(only, () => new Scripted("p", { text: "P" }), realClock);
    expect(await collect(r, {})).toBe("P");
  });
});

describe("primary failure reports", () => {
  it("reports errors and first-token timeouts of the primary, never of the backup", async () => {
    const seen: PrimaryFailure[] = [];
    setFailureReporter((f) => seen.push(f));
    const failing = new ModelRouter(
      stages(),
      (route) =>
        new Scripted(route.provider, route.provider === "p" ? { fail: true } : { text: "B" }),
      realClock,
    );
    expect(await collect(failing, {})).toBe("B");
    const slow = new ModelRouter(
      stages(),
      (route) =>
        new Scripted(route.provider, route.provider === "p" ? { delay: 400 } : { text: "B" }),
      realClock,
    );
    expect(await collect(slow, {})).toBe("B");
    expect(seen).toEqual([
      { stage: "suggest", provider: "groq", reason: "error" },
      { stage: "suggest", provider: "groq", reason: "timeout" },
    ]);
  });

  it("a reporter that throws never breaks a call", async () => {
    setFailureReporter(() => {
      throw new Error("offline");
    });
    const r = new ModelRouter(
      stages(),
      (route) =>
        new Scripted(route.provider, route.provider === "p" ? { fail: true } : { text: "B" }),
      realClock,
    );
    expect(await collect(r, {})).toBe("B");
  });
});
