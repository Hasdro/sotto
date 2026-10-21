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
});
