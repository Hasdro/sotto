/** Tabs open instantly: repeated reads come from memory, writes refresh them (owner, 21 Oct). */
import { Platform } from "react-native";

type Cloud = typeof import("../lib/cloud");
type Compat = typeof import("../lib/cloudCompat");

const BUNDLE = {
  company: { id: "co", name: "Co" },
  providers: {},
  stages: {},
  stage_slots: {},
  overrides: [],
  key_status: {},
  playbook: [],
  settings: {},
};

function server(log: string[], hold?: { release: () => void }) {
  let gate: Promise<void> = Promise.resolve();
  if (hold) gate = new Promise((r) => (hold.release = r));
  return jest.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    log.push(`${init?.method ?? "GET"} ${path}`);
    if (path.endsWith("/me") || path.endsWith("/bundle")) await gate;
    const body = path.endsWith("/auth/login")
      ? { token: "t" }
      : path.endsWith("/me")
        ? {
            user: { id: "u", email: "u@a.test", name: "U", role: "admin" },
            company: { id: "co", name: "Co" },
          }
        : path.endsWith("/bundle")
          ? BUNDLE
          : path.endsWith("/team")
            ? { users: [] }
            : {};
    return new Response(JSON.stringify(body), { status: 200 });
  });
}

describe("server reads", () => {
  const saved = process.env.EXPO_PUBLIC_SOTTO_SERVER;
  const realFetch = globalThis.fetch;
  let cloud: Cloud;
  let compat: Compat;
  let log: string[];

  beforeEach(() => {
    process.env.EXPO_PUBLIC_SOTTO_SERVER = "https://cloud.example.test";
    jest.replaceProperty(Platform, "OS", "web");
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    log = [];
    jest.isolateModules(() => {
      cloud = require("../lib/cloud");
      compat = require("../lib/cloudCompat");
    });
  });
  afterEach(() => {
    process.env.EXPO_PUBLIC_SOTTO_SERVER = saved;
    globalThis.fetch = realFetch;
    delete (globalThis as { localStorage?: unknown }).localStorage;
    jest.restoreAllMocks();
  });

  async function signedIn() {
    globalThis.fetch = server(log) as unknown as typeof fetch;
    await cloud.signIn("u@a.test", "pw");
    log.length = 0;
  }

  it("asks for the profile and the call bundle at the same time", async () => {
    const hold = { release: () => undefined };
    globalThis.fetch = server(log, hold) as unknown as typeof fetch;
    const done = cloud.signIn("u@a.test", "pw");
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(log).toEqual(["POST /api/v1/auth/login", "GET /api/v1/me", "GET /api/v1/bundle"]);
    hold.release();
    await done;
  });

  it("answers a repeated read from memory", async () => {
    await signedIn();
    await cloud.cloudApi("/api/v1/team");
    await cloud.cloudApi("/api/v1/team");
    expect(log).toEqual(["GET /api/v1/team"]);
  });

  it("reads again after a change", async () => {
    await signedIn();
    await cloud.cloudApi("/api/v1/team");
    await cloud.cloudApi("/api/v1/team", { method: "POST", body: { email: "x@a.test" } });
    await cloud.cloudApi("/api/v1/team");
    expect(log).toEqual(["GET /api/v1/team", "POST /api/v1/team", "GET /api/v1/team"]);
  });

  it("opens the keys and playbook pages without asking the server", async () => {
    await signedIn();
    await compat.cloudCompat("/api/providers");
    await compat.cloudCompat("/api/playbook");
    expect(log).toEqual([]);
  });

  it("forgets everything at sign-out", async () => {
    await signedIn();
    await cloud.cloudApi("/api/v1/team");
    await cloud.signOut();
    globalThis.fetch = server(log) as unknown as typeof fetch;
    await cloud.signIn("u@a.test", "pw");
    log.length = 0;
    await cloud.cloudApi("/api/v1/team");
    expect(log).toEqual(["GET /api/v1/team"]);
  });

  it("uploads a recording as the file itself, with this device's sign-in", async () => {
    await signedIn();
    const sent = jest.fn(async () => new Response("{}", { status: 200 }));
    const wav = new Blob(["RIFF"], { type: "audio/wav" });
    await cloud.cloudApi("/api/v1/recordings/c1", { method: "PUT", raw: wav }, sent as never);
    const [url, init] = sent.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://cloud.example.test/api/v1/recordings/c1");
    expect(init.body).toBe(wav);
    expect((init.headers as Record<string, string>)["content-type"]).toBe("audio/wav");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer t");
  });

  it("plays a recording from the server, or nothing when there is none", async () => {
    await signedIn();
    const ok = jest.fn(async () => new Response("RIFF", { status: 200 }));
    expect(await (await cloud.cloudBlob("/api/v1/recordings/c1", ok as never))?.text()).toBe(
      "RIFF",
    );
    const missing = jest.fn(async () => new Response("{}", { status: 404 }));
    expect(await cloud.cloudBlob("/api/v1/recordings/c2", missing as never)).toBeNull();
  });
});
