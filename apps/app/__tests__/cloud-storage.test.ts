/** Start-up must not hang when the phone's secure storage refuses (T-016: unsigned iOS build). */
jest.mock("expo-secure-store", () => {
  const refuse = () => Promise.reject(new Error("errSecMissingEntitlement"));
  return { getItemAsync: refuse, setItemAsync: refuse, deleteItemAsync: refuse };
});

describe("cloud session storage", () => {
  const saved = process.env.EXPO_PUBLIC_SOTTO_SERVER;
  beforeEach(() => {
    process.env.EXPO_PUBLIC_SOTTO_SERVER = "https://cloud.example.test";
  });
  afterEach(() => {
    process.env.EXPO_PUBLIC_SOTTO_SERVER = saved;
  });

  it("shows sign-in instead of hanging when secure storage refuses", async () => {
    let cloud: typeof import("../lib/cloud") | undefined;
    jest.isolateModules(() => {
      cloud = require("../lib/cloud");
    });
    if (!cloud) throw new Error("module did not load");
    expect(cloud.cloudState().status).toBe("loading");
    await cloud.startCloud();
    expect(cloud.cloudState().status).toBe("signed_out");
  });

  it("keeps the session in memory for this run when storage refuses", async () => {
    let cloud: typeof import("../lib/cloud") | undefined;
    jest.isolateModules(() => {
      cloud = require("../lib/cloud");
    });
    if (!cloud) throw new Error("module did not load");
    const fetcher = jest.fn(async (url: string) => {
      const body = url.endsWith("/auth/login")
        ? { token: "t-1" }
        : { user: { id: "u", email: "a@a.test", name: "A", role: "agent" }, company: null };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const realFetch = globalThis.fetch;
    globalThis.fetch = fetcher as unknown as typeof fetch;
    try {
      await cloud.signIn("a@a.test", "pw");
      expect(cloud.cloudState().status).toBe("signed_in");
      const meCall = fetcher.mock.calls.find(([u]) => u.endsWith("/api/v1/me"));
      expect(meCall).toBeDefined();
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
