/**
 * Persistent login (R9, D-029): the app renews its access token silently, never signs out on a
 * network error or a 5xx, migrates a 0.2.0 token without a new sign-in, and keeps tokens in the
 * desktop's secure storage rather than localStorage.
 */
const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: async (k: string) => mockStore.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => {
    mockStore.set(k, v);
  },
  deleteItemAsync: async (k: string) => {
    mockStore.delete(k);
  },
}));

const mockWipe = { calls: 0, recordings: 0 };
jest.mock("../lib/deviceHistory", () => ({
  clearDeviceCalls: () => {
    mockWipe.calls += 1;
  },
  setDeviceOwner: () => {},
}));
jest.mock("../lib/recordings", () => ({
  clearRecordings: async () => {
    mockWipe.recordings += 1;
  },
}));

type Cloud = typeof import("../lib/cloud");
type Call = { method: string; path: string; auth: string | null; body: unknown };
type Reply = { status: number; body?: unknown } | "network";

const ME = {
  user: { id: "u", email: "a@a.test", name: "A", role: "agent", must_change_password: false },
  company: null,
  features: { reports: { state: "available" } },
};
const PAIR = { token: "sa_1", refresh_token: "sr_1", access_expires_at: Date.now() + 3_600_000 };

function load(): Cloud {
  let cloud: Cloud | undefined;
  jest.isolateModules(() => {
    cloud = require("../lib/cloud");
  });
  if (!cloud) throw new Error("module did not load");
  return cloud;
}

/** A fake server: `routes` answers by "METHOD /path", in order when given a list. */
function serve(routes: Record<string, Reply | Reply[]>) {
  const calls: Call[] = [];
  const fetcher = jest.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const method = init?.method ?? "GET";
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      method,
      path,
      auth: headers.authorization ?? null,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    const entry = routes[`${method} ${path}`];
    const reply = Array.isArray(entry) ? (entry.length > 1 ? entry.shift() : entry[0]) : entry;
    if (reply === "network") throw new TypeError("Failed to fetch");
    if (!reply) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status });
  });
  globalThis.fetch = fetcher as unknown as typeof fetch;
  return calls;
}

const realFetch = globalThis.fetch;
const saved = process.env.EXPO_PUBLIC_SOTTO_SERVER;
beforeEach(() => {
  process.env.EXPO_PUBLIC_SOTTO_SERVER = "https://cloud.example.test";
  mockStore.clear();
  mockWipe.calls = 0;
  mockWipe.recordings = 0;
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
});
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env.EXPO_PUBLIC_SOTTO_SERVER = saved;
  delete (globalThis as { sottoDesktop?: unknown }).sottoDesktop;
  jest.useRealTimers();
});

function session(): { access: string; refresh: string | null } {
  return JSON.parse(mockStore.get("sotto.session") ?? "null");
}

describe("persistent login", () => {
  it("asks for a refresh-token pair at sign-in and keeps it, not the 0.2.0 key", async () => {
    const calls = serve({
      "POST /api/v1/auth/login": { status: 200, body: PAIR },
      "GET /api/v1/me": { status: 200, body: ME },
    });
    const cloud = load();
    await cloud.signIn("a@a.test", "pw");
    expect(calls[0]?.body).toMatchObject({ session: "pair" });
    expect(calls[0]?.auth).toBeNull();
    expect(session()).toMatchObject({ access: "sa_1", refresh: "sr_1" });
    expect(mockStore.has("sotto.token")).toBe(false);
    expect(cloud.cloudState().status).toBe("signed_in");
  });

  it("renews silently on an expired access token and repeats the request", async () => {
    const calls = serve({
      "POST /api/v1/auth/login": { status: 200, body: PAIR },
      "GET /api/v1/me": [
        { status: 200, body: ME },
        { status: 401, body: { code: "signed_out" } },
        { status: 200, body: ME },
      ],
      "POST /api/v1/auth/refresh": {
        status: 200,
        body: { token: "sa_2", refresh_token: "sr_2", access_expires_at: Date.now() + 3_600_000 },
      },
    });
    const cloud = load();
    await cloud.signIn("a@a.test", "pw");
    await cloud.refreshCloud();
    const refresh = calls.find((c) => c.path === "/api/v1/auth/refresh");
    expect(refresh?.body).toEqual({ refresh_token: "sr_1" });
    expect(refresh?.auth).toBeNull();
    expect(calls.at(-1)?.auth).toBe("Bearer sa_2");
    expect(session()).toMatchObject({ access: "sa_2", refresh: "sr_2" });
    expect(cloud.cloudState().status).toBe("signed_in");
  });

  it("renews before the access token runs out, once for many requests", async () => {
    const calls = serve({
      "POST /api/v1/auth/login": {
        status: 200,
        body: { ...PAIR, access_expires_at: Date.now() + 30_000 },
      },
      "GET /api/v1/me": { status: 200, body: ME },
      "GET /api/v1/team": { status: 200, body: { users: [] } },
      "GET /api/v1/devices": { status: 200, body: { devices: [] } },
      "POST /api/v1/auth/refresh": {
        status: 200,
        body: { token: "sa_2", refresh_token: "sr_2", access_expires_at: Date.now() + 3_600_000 },
      },
    });
    const cloud = load();
    await cloud.signIn("a@a.test", "pw");
    await Promise.all([cloud.cloudApi("/api/v1/team"), cloud.cloudApi("/api/v1/devices")]);
    expect(calls.filter((c) => c.path === "/api/v1/auth/refresh")).toHaveLength(1);
  });

  it.each([
    ["a 5xx", { status: 503 }],
    ["no network", "network"],
  ] as const)("stays signed in when renewal meets %s", async (_name, reply) => {
    serve({
      "POST /api/v1/auth/login": { status: 200, body: PAIR },
      "GET /api/v1/me": [
        { status: 200, body: ME },
        { status: 401, body: {} },
      ],
      "POST /api/v1/auth/refresh": reply as Reply,
    });
    const cloud = load();
    await cloud.signIn("a@a.test", "pw");
    await expect(cloud.refreshCloud()).rejects.toMatchObject({ code: "offline" });
    expect(cloud.cloudState().status).toBe("signed_in");
    expect(session()).toMatchObject({ refresh: "sr_1" });
  });

  it("stays signed in when an ordinary request gets a 5xx or no network", async () => {
    serve({
      "POST /api/v1/auth/login": { status: 200, body: PAIR },
      "GET /api/v1/me": { status: 200, body: ME },
      "GET /api/v1/team": [{ status: 502 }, "network"],
    });
    const cloud = load();
    await cloud.signIn("a@a.test", "pw");
    await expect(cloud.cloudApi("/api/v1/team")).rejects.toMatchObject({ status: 502 });
    await expect(cloud.cloudApi("/api/v1/team")).rejects.toMatchObject({ code: "offline" });
    expect(cloud.cloudState().status).toBe("signed_in");
    expect(session()).toMatchObject({ access: "sa_1" });
  });

  it("signs out when the server refuses the refresh token, keeping this device's calls", async () => {
    serve({
      "POST /api/v1/auth/login": { status: 200, body: PAIR },
      "GET /api/v1/me": [
        { status: 200, body: ME },
        { status: 401, body: {} },
      ],
      "POST /api/v1/auth/refresh": { status: 401, body: { code: "signed_out" } },
    });
    const cloud = load();
    await cloud.signIn("a@a.test", "pw");
    await expect(cloud.refreshCloud()).rejects.toMatchObject({ status: 401 });
    await Promise.resolve();
    await new Promise<void>((r) => setImmediate(r));
    expect(cloud.cloudState().status).toBe("signed_out");
    expect(mockStore.has("sotto.session")).toBe(false);
    // D-029 amendment: a server-side end (revoke, reuse, expiry) keeps the account's calls.
    expect(mockWipe).toEqual({ calls: 0, recordings: 0 });
  });

  it("wipes this device's calls when the device was removed, or on manual sign-out", async () => {
    serve({
      "POST /api/v1/auth/login": { status: 200, body: PAIR },
      "GET /api/v1/me": [
        { status: 200, body: ME },
        { status: 401, body: { code: "device_removed" } },
        { status: 200, body: ME },
      ],
      "POST /api/v1/auth/refresh": { status: 401, body: { code: "device_removed" } },
      "POST /api/v1/auth/logout": { status: 200 },
    });
    const cloud = load();
    await cloud.signIn("a@a.test", "pw");
    await expect(cloud.refreshCloud()).rejects.toMatchObject({ status: 401 });
    await new Promise<void>((r) => setImmediate(r));
    expect(cloud.cloudState().status).toBe("signed_out");
    expect(mockWipe).toEqual({ calls: 1, recordings: 1 });
    await cloud.signIn("a@a.test", "pw");
    await cloud.signOut();
    expect(mockWipe).toEqual({ calls: 2, recordings: 2 });
  });

  it("opens with the last profile when it starts offline or the server is down", async () => {
    mockStore.set("sotto.session", JSON.stringify({ ...tokensOf(PAIR), me: ME }));
    serve({ "GET /api/v1/me": "network", "GET /api/v1/bundle": "network" });
    const cloud = load();
    await cloud.startCloud();
    const s = cloud.cloudState();
    expect(s.status).toBe("signed_in");
    expect(s.status === "signed_in" && s.offline).toBe(true);
    // Back online: the next check loads the real session.
    serve({ "GET /api/v1/me": { status: 200, body: ME }, "GET /api/v1/bundle": { status: 500 } });
    await cloud.refreshFeatures();
    const after = cloud.cloudState();
    expect(after.status === "signed_in" && after.offline).toBeFalsy();
  });

  it("migrates a 0.2.0 token once, with no new sign-in", async () => {
    mockStore.set("sotto.token", "old-30-day-token");
    const calls = serve({
      "POST /api/v1/auth/migrate": { status: 200, body: PAIR },
      "GET /api/v1/me": { status: 200, body: ME },
    });
    const cloud = load();
    await cloud.startCloud();
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/api/v1/auth/migrate",
      auth: "Bearer old-30-day-token",
    });
    expect(cloud.cloudState().status).toBe("signed_in");
    expect(session()).toMatchObject({ access: "sa_1", refresh: "sr_1" });
    expect(mockStore.has("sotto.token")).toBe(false);
  });

  it("keeps the 0.2.0 token and stays signed in if migration cannot reach the server", async () => {
    mockStore.set("sotto.token", "old-30-day-token");
    serve({
      "POST /api/v1/auth/migrate": { status: 503 },
      "GET /api/v1/me": { status: 200, body: ME },
    });
    const cloud = load();
    await cloud.startCloud();
    expect(cloud.cloudState().status).toBe("signed_in");
    expect(mockStore.get("sotto.token")).toBe("old-30-day-token");
  });

  it("retries a migration whose answer was lost, and keeps the 0.2.0 token until a pair is saved", async () => {
    mockStore.set("sotto.token", "old-30-day-token");
    serve({
      "POST /api/v1/auth/migrate": "network",
      "GET /api/v1/me": { status: 200, body: ME },
    });
    let cloud = load();
    await cloud.startCloud();
    expect(mockStore.get("sotto.token")).toBe("old-30-day-token");
    const calls = serve({
      "POST /api/v1/auth/migrate": { status: 200, body: PAIR },
      "GET /api/v1/me": { status: 200, body: ME },
    });
    cloud = load();
    await cloud.startCloud();
    expect(calls[0]).toMatchObject({
      path: "/api/v1/auth/migrate",
      auth: "Bearer old-30-day-token",
    });
    expect(session()).toMatchObject({ access: "sa_1" });
    expect(mockStore.has("sotto.token")).toBe(false);
  });

  it("on a desktop that cannot encrypt, never migrates: the 0.2.0 token keeps working", async () => {
    mockStore.set("sotto.token", "old-30-day-token");
    (globalThis as { sottoDesktop?: unknown }).sottoDesktop = {
      secureStore: {
        get: async () => null,
        set: async () => false, // safeStorage unavailable
        delete: async () => {},
      },
    };
    const calls = serve({
      "POST /api/v1/auth/migrate": { status: 200, body: PAIR },
      "GET /api/v1/me": { status: 200, body: ME },
    });
    const cloud = load();
    await cloud.startCloud();
    expect(calls.some((c) => c.path === "/api/v1/auth/migrate")).toBe(false);
    expect(calls[0]).toMatchObject({ path: "/api/v1/me", auth: "Bearer old-30-day-token" });
    expect(mockStore.get("sotto.token")).toBe("old-30-day-token");
    expect(cloud.cloudState().status).toBe("signed_in");
  });

  it("re-reads the bundle when the feature map changes, but not during a live call", async () => {
    const calls = serve({
      "POST /api/v1/auth/login": { status: 200, body: PAIR },
      "GET /api/v1/me": { status: 200, body: { ...ME, company: { id: "co" } } },
      "GET /api/v1/bundle": { status: 200, body: { company: { context: "x" } } },
      "GET /api/v1/features": [
        { status: 200, body: { features: { reports: { state: "available" } } } },
        { status: 200, body: { features: { ai_knowledge: { state: "off_by_platform" } } } },
      ],
    });
    const cloud = load();
    await cloud.signIn("a@a.test", "pw");
    const bundles = () => calls.filter((c) => c.path === "/api/v1/bundle").length;
    const before = bundles();
    await cloud.refreshFeatures(); // unchanged map: no new bundle
    expect(bundles()).toBe(before);
    cloud.setCallLive(true);
    await cloud.refreshFeatures(); // changed, but a call is on
    expect(bundles()).toBe(before);
    cloud.setCallLive(false); // the call ended: now the bundle is re-read
    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));
    expect(bundles()).toBe(before + 1);
  });

  it("re-reads the feature map every 10 minutes", async () => {
    const calls = serve({
      "POST /api/v1/auth/login": { status: 200, body: PAIR },
      "GET /api/v1/me": { status: 200, body: ME },
      "GET /api/v1/features": {
        status: 200,
        body: { features: { reports: { state: "off_by_platform" } } },
      },
    });
    const cloud = load();
    await cloud.signIn("a@a.test", "pw");
    jest.advanceTimersByTime(cloud.FEATURES_EVERY_MS);
    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));
    expect(calls.some((c) => c.path === "/api/v1/features")).toBe(true);
    const s = cloud.cloudState();
    expect(s.status === "signed_in" && s.me.features?.reports?.state).toBe("off_by_platform");
  });

  it("on the desktop, keeps tokens in safeStorage through the bridge, never in localStorage", async () => {
    const secure = new Map<string, string>();
    (globalThis as { sottoDesktop?: unknown }).sottoDesktop = {
      secureStore: {
        get: async (k: string) => secure.get(k) ?? null,
        set: async (k: string, v: string) => {
          secure.set(k, v);
          return true;
        },
        delete: async (k: string) => {
          secure.delete(k);
        },
      },
    };
    serve({
      "POST /api/v1/auth/login": { status: 200, body: PAIR },
      "GET /api/v1/me": { status: 200, body: ME },
    });
    const cloud = load();
    await cloud.signIn("a@a.test", "pw");
    expect([...secure.keys()]).toEqual(["sotto.session"]);
    expect(mockStore.has("sotto.session")).toBe(false);
    await cloud.signOut();
    expect(secure.size).toBe(0);
  });
});

function tokensOf(p: typeof PAIR) {
  return { access: p.token, refresh: p.refresh_token, access_expires_at: p.access_expires_at };
}
