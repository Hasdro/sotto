import { ApiError, api, apiOrigin, DEFAULT_SOCKET_URL, socketUrl } from "./server";

const at = (protocol: string, host: string, port = "") => ({ protocol, host, port });

describe("where the Sotto server is (D-020)", () => {
  it("uses its own origin when the server serves the page", () => {
    expect(socketUrl(at("https:", "sotto.example.com"))).toBe("wss://sotto.example.com/ws");
    expect(socketUrl(at("http:", "127.0.0.1:8787", "8787"))).toBe("ws://127.0.0.1:8787/ws");
    expect(apiOrigin(at("https:", "sotto.example.com"))).toBe("https://sotto.example.com");
  });

  it("uses the local server under the Expo dev server, on native and in tests", () => {
    expect(socketUrl(at("http:", "localhost:8081", "8081"))).toBe(DEFAULT_SOCKET_URL);
    expect(socketUrl(null)).toBe(DEFAULT_SOCKET_URL);
    expect(apiOrigin(null)).toBe("http://127.0.0.1:8787");
  });

  it("sends JSON and surfaces the server's error message", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return {
        ok: false,
        status: 400,
        json: async () => ({ error: "that does not look like an API key" }),
      };
    }) as unknown as typeof fetch;
    await expect(
      api("/api/providers/groq/key", { method: "PUT", body: { key: "x" } }, fetcher),
    ).rejects.toEqual(new ApiError(400, "that does not look like an API key"));
    expect(calls[0]?.url).toBe("http://127.0.0.1:8787/api/providers/groq/key");
    expect(calls[0]?.init.headers).toEqual({ "content-type": "application/json" });
    expect(calls[0]?.init.body).toBe('{"key":"x"}');
  });
});
