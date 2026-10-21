/** Customer transcripts on a shared computer must not pass from one account to the next (T-022). */
import { Platform } from "react-native";

type Cloud = typeof import("../lib/cloud");
type History = typeof import("../lib/deviceHistory");

class FakeStorage {
  private readonly items = new Map<string, string>();
  getItem(k: string) {
    return this.items.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.items.set(k, v);
  }
  removeItem(k: string) {
    this.items.delete(k);
  }
  keys() {
    return [...this.items.keys()];
  }
}

const call = (id: string) => ({
  id,
  started_at: 1,
  ended_at: 2,
  title: "Call",
  mode: "live" as const,
  cards: 1,
  p50_ms: null,
  p95_ms: null,
  transcript: [{ kind: "line" as const, speaker: "customer" as const, text: "secret", at_ms: 0 }],
});

function server(userId: string, companyId: string) {
  return jest.fn(async (url: string) => {
    const body = url.endsWith("/auth/login")
      ? { token: `t-${userId}` }
      : url.endsWith("/api/v1/me")
        ? {
            user: { id: userId, email: `${userId}@a.test`, name: userId, role: "agent" },
            company: { id: companyId, name: companyId },
          }
        : {};
    return new Response(JSON.stringify(body), { status: 200 });
  });
}

describe("calls kept on this device", () => {
  const saved = process.env.EXPO_PUBLIC_SOTTO_SERVER;
  const realFetch = globalThis.fetch;
  let storage: FakeStorage;
  let cloud: Cloud;
  let history: History;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_SOTTO_SERVER = "https://cloud.example.test";
    jest.replaceProperty(Platform, "OS", "web");
    storage = new FakeStorage();
    (globalThis as { localStorage?: unknown }).localStorage = storage;
    jest.isolateModules(() => {
      cloud = require("../lib/cloud");
      history = require("../lib/deviceHistory");
    });
  });
  afterEach(() => {
    process.env.EXPO_PUBLIC_SOTTO_SERVER = saved;
    globalThis.fetch = realFetch;
    delete (globalThis as { localStorage?: unknown }).localStorage;
    jest.restoreAllMocks();
  });

  it("does not show user A's calls to user B after sign-out", async () => {
    globalThis.fetch = server("a", "co-a") as unknown as typeof fetch;
    await cloud.signIn("a@a.test", "pw");
    history.saveDeviceCall(call("c1"));
    expect(history.deviceCalls()).toHaveLength(1);

    await cloud.signOut();
    expect(history.deviceCalls()).toHaveLength(0);
    expect(storage.keys().filter((k) => k.startsWith("sotto.calls"))).toEqual([]);

    globalThis.fetch = server("b", "co-b") as unknown as typeof fetch;
    await cloud.signIn("b@b.test", "pw");
    expect(history.deviceCalls()).toHaveLength(0);
    expect(history.deviceCall("c1")).toBeNull();
  });

  it("keeps each account's calls under its own key", async () => {
    globalThis.fetch = server("a", "co-a") as unknown as typeof fetch;
    await cloud.signIn("a@a.test", "pw");
    history.saveDeviceCall(call("c1"));
    expect(storage.keys()).toContain("sotto.calls.co-a.a");
  });

  it("discards calls left under the old shared key", async () => {
    storage.setItem("sotto.calls", JSON.stringify([call("old")]));
    globalThis.fetch = server("a", "co-a") as unknown as typeof fetch;
    await cloud.signIn("a@a.test", "pw");
    expect(history.deviceCalls()).toHaveLength(0);
    expect(storage.getItem("sotto.calls")).toBeNull();
  });
});
