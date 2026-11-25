import { clearEvents, logEvent, recentEvents, redactMeta, redactText } from "../lib/obs";
import {
  _clearOutboxForTest,
  _setOutboxStorageForTest,
  enqueue,
  flushOutbox,
  listOutbox,
  type OutboxStorage,
  outboxCount,
  registerOutboxSender,
} from "../lib/outbox";
import { PipelineSupervisor } from "../lib/pipelineSupervisor";
import { ApiError, api } from "../lib/server";

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

describe("obs.ts redaction (S2, L5)", () => {
  beforeEach(() => clearEvents());

  it("strips transcript, names, phones, emails, and keys", () => {
    logEvent("call.live", "turn", {
      callId: "call-1",
      transcript: "Customer said 50k budget",
      customer_name: "Alice Smith",
      phone: "+1-555-888-9999",
      email: "alice@example.com",
      api_key: `sk-${"secretkey1234567890"}`,
      latency_ms: 412,
      note: "Mail alice@example.com or call +1 555 888 9999 with ghp_1234567890abcdef1234",
    });
    const ev = recentEvents(1)[0];
    expect(ev).toBeDefined();
    expect(ev?.meta.transcript).toBeUndefined();
    expect(ev?.meta.customer_name).toBeUndefined();
    expect(ev?.meta.phone).toBeUndefined();
    expect(ev?.meta.email).toBeUndefined();
    expect(ev?.meta.api_key).toBeUndefined();
    expect(ev?.meta.latency_ms).toBe(412);
    expect(String(ev?.meta.note)).not.toContain("alice@example.com");
    expect(String(ev?.meta.note)).not.toContain("555 888 9999");
    expect(String(ev?.meta.note)).not.toContain("ghp_1234567890");
    expect(redactText("Bearer eyJhbGciOiJIUzI1NiJ9.abcdef")).toContain("[REDACTED_KEY]");
    expect(redactMeta({ ok: true, secret_token: "abc" })).toEqual({ ok: true });
  });
});

describe("server.ts timeout and retries (S4)", () => {
  it("retries idempotent GET up to 2 times and succeeds", async () => {
    let calls = 0;
    const fakeFetch = (async () => {
      calls += 1;
      if (calls < 3) return new Response("{}", { status: 503 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    const res = await api<{ ok: boolean }>("/api/health", { retryDelaysMs: [1, 2] }, fakeFetch);
    expect(res.ok).toBe(true);
    expect(calls).toBe(3);
  });

  it("does NOT retry non-idempotent POST", async () => {
    let calls = 0;
    const fakeFetch = (async () => {
      calls += 1;
      return new Response("{}", { status: 503 });
    }) as typeof fetch;

    await expect(
      api("/api/send", { method: "POST", body: { x: 1 }, retryDelaysMs: [1, 2] }, fakeFetch),
    ).rejects.toThrow(ApiError);
    expect(calls).toBe(1);
  });

  it("aborts and returns a plain message on timeout", async () => {
    const hangingFetch = ((_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as typeof fetch;

    await expect(
      api("/api/slow", { timeoutMs: 15, retryDelaysMs: [] }, hangingFetch),
    ).rejects.toThrow("The request took too long");
  });
});

describe("outbox.ts offline queue (S4)", () => {
  beforeEach(() => {
    _setOutboxStorageForTest(memoryStorage());
    _clearOutboxForTest();
  });
  afterEach(() => {
    _setOutboxStorageForTest(null);
  });

  it("survives restart, deduplicates by key, and sends once online with no duplicates", async () => {
    const persistent = memoryStorage();
    _setOutboxStorageForTest(persistent);

    const id1 = enqueue("feedback", { callId: "c1", rating: "up" }, { dedupeKey: "fb:c1" });
    const id2 = enqueue("feedback", { callId: "c1", rating: "up" }, { dedupeKey: "fb:c1" });
    expect(id2).toBe(id1);
    expect(outboxCount()).toBe(1);

    // Simulate app restart by re-attaching the same persistent storage
    _setOutboxStorageForTest(persistent);
    expect(listOutbox()).toHaveLength(1);

    const delivered: unknown[] = [];
    registerOutboxSender("feedback", async (payload) => {
      delivered.push(payload);
    });

    // Concurrent flushes must not duplicate sends
    const [r1, r2] = await Promise.all([flushOutbox(), flushOutbox()]);
    expect(r1.sent).toBe(1);
    expect(r2.sent).toBe(1);
    expect(delivered).toHaveLength(1);
    expect(outboxCount()).toBe(0);
  });
});

describe("PipelineSupervisor mid-call recovery (S2)", () => {
  it("shows Reconnecting… and resumes the same callId within 3 s", async () => {
    const sup = new PipelineSupervisor({ backoffMs: [5, 10, 20], maxRecoveryMs: 3000 });
    const states: string[] = [];
    sup.subscribe((s) => states.push(`${s.status}:${s.bannerText ?? ""}:${s.callId ?? ""}`));

    sup.markConnected("call-777");
    let attempts = 0;
    const resumed = await sup.handleDrop(async (callId) => {
      attempts += 1;
      expect(callId).toBe("call-777");
      return attempts >= 2;
    });

    expect(resumed).toBe(true);
    expect(states.some((s) => s.includes("reconnecting:Reconnecting…:call-777"))).toBe(true);
    const snap = sup.snapshot();
    expect(snap.status).toBe("connected");
    expect(snap.callId).toBe("call-777");
    expect(snap.lastRecoveredMs).not.toBeNull();
    expect(snap.lastRecoveredMs ?? 9999).toBeLessThan(3000);
  });
});
