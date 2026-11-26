/**
 * Tests for Round 4 platform fixes:
 * - outbox owner scoping, MAX_ATTEMPTS=5, non-retryable 4xx drop
 * - obs redaction preservation of dates/UUIDs + clearSafetyLog
 * - cloud.ts request path validation, cloudBlob timeout, signOut cleanup
 * - packages/engine D-096 local routing, slow opt-in holding replacement + badge + cloud backup
 */
import { buildRuntime, type CallBundle, type Clock, LocalCall } from "@sotto/engine";
import { CloudError, cloudBlob, request } from "../lib/cloud";
import { clearEvents, clearSafetyLog, logEvent, readSafetyLog, recentEvents } from "../lib/obs";
import {
  _clearOutboxForTest,
  _setOutboxStorageForTest,
  clearOutbox,
  enqueue,
  flushOutbox,
  listOutbox,
  type OutboxStorage,
  outboxCount,
  registerOutboxSender,
  setOutboxOwner,
} from "../lib/outbox";

function memoryStorage(): OutboxStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

describe("obs + outbox tenant scoping & failure bounds", () => {
  beforeEach(() => {
    clearEvents();
    _setOutboxStorageForTest(memoryStorage());
    setOutboxOwner(null, null);
    _clearOutboxForTest();
  });

  afterEach(() => {
    setOutboxOwner(null, null);
    _clearOutboxForTest();
    _setOutboxStorageForTest(null);
  });

  it("isolates outbox items per tenant/user owner and clears only active owner", () => {
    setOutboxOwner("c1", "u1");
    enqueue("followup", { callId: "call-1" });
    expect(outboxCount()).toBe(1);

    setOutboxOwner("c2", "u2");
    expect(outboxCount()).toBe(0);
    enqueue("followup", { callId: "call-2" });
    expect(outboxCount()).toBe(1);

    clearOutbox();
    expect(outboxCount()).toBe(0);

    setOutboxOwner("c1", "u1");
    expect(outboxCount()).toBe(1);
    expect(listOutbox()[0]?.payload).toEqual({ callId: "call-1" });
  });

  it("drops permanent 4xx items immediately and retries up to 5 times on 5xx", async () => {
    setOutboxOwner("c1", "u1");
    registerOutboxSender("perm4xx", async () => {
      throw new CloudError(422, "invalid", "bad payload");
    });
    enqueue("perm4xx", { a: 1 });
    await flushOutbox();
    expect(outboxCount()).toBe(0);

    let tries = 0;
    registerOutboxSender("transient5xx", async () => {
      tries += 1;
      throw new Error("503 service unavailable");
    });
    enqueue("transient5xx", { b: 2 });
    for (let i = 0; i < 6; i += 1) {
      await flushOutbox();
    }
    expect(tries).toBe(5);
    expect(outboxCount()).toBe(0);
  });

  it("preserves ISO dates and UUIDs in obs while redacting blocked keys and URL secrets", () => {
    logEvent("call.meta", "checked", {
      callId: "123e4567-e89b-12d3-a456-426614174000",
      auth_header: "Bearer secret-token-12345678",
      set_cookie: "sid=abc",
      private_key: "pem",
      prompt_text: "hello",
      reply_text: "world",
      note: "date 2026-11-25 ref 123e4567-e89b-12d3-a456-426614174000 sa_abcdefghijklmnop url=https://x.test?token=mysecret",
    });
    const ev = recentEvents(1)[0];
    expect(ev).toBeDefined();
    expect(ev?.meta.auth_header).toBeUndefined();
    expect(ev?.meta.set_cookie).toBeUndefined();
    expect(ev?.meta.private_key).toBeUndefined();
    expect(ev?.meta.prompt_text).toBeUndefined();
    expect(ev?.meta.reply_text).toBeUndefined();
    const note = String(ev?.meta.note);
    expect(note).toContain("2026-11-25");
    expect(note).toContain("123e4567-e89b-12d3-a456-426614174000");
    expect(note).toContain("[REDACTED_KEY]");
    expect(note).not.toContain("mysecret");
    expect(note).not.toContain("sa_abcdefghijklmnop");

    clearSafetyLog();
    expect(readSafetyLog()).toHaveLength(0);
  });
});

describe("cloud.ts validation & cloudBlob", () => {
  it("rejects non-leading-slash paths in request()", async () => {
    const prev = (globalThis as { localStorage?: Storage }).localStorage;
    const store = memoryStorage();
    Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true });
    store.setItem("sotto.origin", "https://cloud.example.com");
    try {
      await expect(request("https://evil.example/steal")).rejects.toThrow(/start with \//);
      expect(await cloudBlob("https://evil.example/steal")).toBeNull();
    } finally {
      Object.defineProperty(globalThis, "localStorage", { value: prev, configurable: true });
    }
  });
});

class FakeClock implements Clock {
  nowMs = 1000;
  private timers: Array<{ at: number; resolve: () => void; aborted: boolean }> = [];
  now(): number {
    return this.nowMs;
  }
  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.resolve();
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const entry = { at: this.nowMs + ms, resolve, aborted: false };
      this.timers.push(entry);
      signal?.addEventListener(
        "abort",
        () => {
          entry.aborted = true;
          resolve();
        },
        { once: true },
      );
    });
  }
  async advance(ms: number): Promise<void> {
    const flush = async () => {
      for (let i = 0; i < 16; i += 1) await Promise.resolve();
      await new Promise<void>((r) => setTimeout(r, 0));
      for (let i = 0; i < 16; i += 1) await Promise.resolve();
    };
    await flush();
    const target = this.nowMs + ms;
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at);
      const next = this.timers.find((t) => !t.aborted && t.at <= target);
      if (!next) break;
      this.timers = this.timers.filter((t) => t !== next);
      this.nowMs = Math.max(this.nowMs, next.at);
      next.resolve();
      await flush();
    }
    this.nowMs = target;
    await flush();
  }
}

function makeBundle(overrides: Partial<CallBundle> = {}): CallBundle {
  return {
    v: 1,
    company: {
      name: "Acme",
      tone: "helpful",
      call_goal: "close",
      holding_line: { en: "One moment while I check." },
      escalation_label: { en: "Escalate" },
      card_language: "en",
      ai_answers_allowed: true,
      agent_context: false,
      backup_disabled: [],
    },
    stages: {
      suggest: { provider: "fake", model: "demo" },
      suggest_backup: { provider: "fake", model: "demo" },
    },
    providers: {},
    stage_slots: { suggest: { kind: "llm", label: "Suggest" } },
    prompts: {
      suggest: {
        key: "suggest",
        version: 1,
        stage: "suggest",
        variables: ["customer_line"],
        body: "Customer asked: {customer_line}",
      },
    },
    playbook: [],
    scenarios: [],
    keys: {},
    ...overrides,
  };
}

function sseResponse(text: string): Response {
  const payload = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      ctrl.enqueue(new TextEncoder().encode(payload));
      ctrl.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

describe("packages/engine D-096 local_model runtime & CallSession", () => {
  it("runs slow_optin with holding at 1.5 s, late replacement, badge, and exclude_p95_alarm", async () => {
    const clock = new FakeClock();
    const fetchFn: typeof fetch = async (_input, init) => {
      await clock.sleep(2200, init?.signal ?? undefined);
      return sseResponse("ANSWER: Enterprise plan is $49 per seat.");
    };
    const bundle = makeBundle({
      local_model: {
        mode: "local_live_slow_optin",
        base_url: "http://127.0.0.1:11434/v1",
        holding_at_ms: 1500,
        badge: "local model – slower",
        exclude_p95_alarm: true,
        allow_cloud_backup: true,
        model: "llama3.2",
      },
    });
    const runtime = buildRuntime(bundle, clock, fetchFn);
    expect(runtime.mode).toBe("live");
    expect(runtime.excludeP95Alarm).toBe(true);

    const cards: Array<{ source: string; label?: string | null; turn_id?: string | null }> = [];
    let summaryExclude = false;
    const call = new LocalCall({
      runtime,
      clock,
      send: (m) => {
        if (m.type === "card" && m.card.seq === 0) cards.push(m.card);
      },
      onEnded: (s) => {
        summaryExclude = Boolean(s.exclude_p95_alarm);
      },
    });
    call.begin();
    try {
      call.say("customer", "What is the price per seat for Enterprise?");
      await clock.advance(1600);
      expect(cards.map((c) => c.source)).toEqual(["holding"]);

      await clock.advance(1000);
      expect(cards.map((c) => c.source)).toEqual(["holding", "ai"]);
      expect(cards[1]?.turn_id).toBe(cards[0]?.turn_id);
      expect(cards[1]?.label).toBe("local model – slower");
    } finally {
      const endP = call.end();
      await clock.advance(10_000);
      await endP;
    }
    expect(summaryExclude).toBe(true);
  });

  it("falls back to cloud backup when allow_cloud_backup=true, else holding when false", async () => {
    const failingLocalWithCloudBackupFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.startsWith("https://backup.example.com")) {
        return sseResponse("ANSWER: Cloud backup answered after local failure.");
      }
      return new Response("down", { status: 503 });
    };

    const clock1 = new FakeClock();
    const rtWithBackup = buildRuntime(
      makeBundle({
        stages: {
          suggest: {
            provider: "openai_compatible",
            model: "cloud-primary",
            base_url: "https://backup.example.com/v1",
          },
          suggest_backup: {
            provider: "openai_compatible",
            model: "cloud-backup",
            base_url: "https://backup.example.com/v1",
          },
        },
        local_model: {
          mode: "local_live",
          base_url: "http://127.0.0.1:11434/v1",
          holding_at_ms: null,
          badge: null,
          exclude_p95_alarm: false,
          allow_cloud_backup: true,
        },
      }),
      clock1,
      failingLocalWithCloudBackupFetch,
    );
    const cards1: Array<{ source: string }> = [];
    const c1 = new LocalCall({
      runtime: rtWithBackup,
      clock: clock1,
      send: (m) => {
        if (m.type === "card" && m.card.seq === 0) cards1.push(m.card);
      },
    });
    c1.begin();
    try {
      c1.say("customer", "Why should I switch today?");
      await clock1.advance(4000);
    } finally {
      const endP1 = c1.end();
      await clock1.advance(10_000);
      await endP1;
    }
    expect(cards1.some((c) => c.source === "backup")).toBe(true);

    const clock2 = new FakeClock();
    const rtNoBackup = buildRuntime(
      makeBundle({
        stages: {
          suggest: {
            provider: "openai_compatible",
            model: "cloud-primary",
            base_url: "https://backup.example.com/v1",
          },
          suggest_backup: {
            provider: "openai_compatible",
            model: "cloud-backup",
            base_url: "https://backup.example.com/v1",
          },
        },
        local_model: {
          mode: "local_live",
          base_url: "http://127.0.0.1:11434/v1",
          holding_at_ms: null,
          badge: null,
          exclude_p95_alarm: false,
          allow_cloud_backup: false,
        },
      }),
      clock2,
      failingLocalWithCloudBackupFetch,
    );
    const cards2: Array<{ source: string }> = [];
    const c2 = new LocalCall({
      runtime: rtNoBackup,
      clock: clock2,
      send: (m) => {
        if (m.type === "card" && m.card.seq === 0) cards2.push(m.card);
      },
    });
    c2.begin();
    try {
      c2.say("customer", "Why should I switch today?");
      await clock2.advance(4000);
    } finally {
      const endP2 = c2.end();
      await clock2.advance(10_000);
      await endP2;
    }
    expect(cards2.map((c) => c.source)).toEqual(["holding"]);
  });
});
