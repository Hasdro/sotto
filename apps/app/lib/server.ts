/**
 * Where the Sotto server is (D-020). The web app is normally served BY the server (`pnpm demo`
 * locally, or the hosted server), so it talks to its own origin. Under the Expo dev server
 * (ports 8081/19006) and on native, it uses EXPO_PUBLIC_DEMO_BRIDGE_URL or the local default.
 */
import { DEMO_DEFAULT_PORT } from "@sotto/shared";

export const DEFAULT_SOCKET_URL = `ws://127.0.0.1:${DEMO_DEFAULT_PORT}/ws`;
const EXPO_DEV_PORTS = new Set(["8081", "19006"]);

type LocationLike = { protocol: string; host: string; port: string };

function pageLocation(): LocationLike | null {
  const loc = (globalThis as { location?: LocationLike }).location;
  return loc && typeof loc.host === "string" && loc.host.length > 0 ? loc : null;
}

/** The server's WebSocket URL for calls. */
export function socketUrl(loc: LocationLike | null = pageLocation()): string {
  // Must stay the literal `process.env.EXPO_PUBLIC_…` form so Expo inlines it at build time.
  const fromEnv = process.env.EXPO_PUBLIC_DEMO_BRIDGE_URL;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  if (loc && (loc.protocol === "http:" || loc.protocol === "https:")) {
    if (!EXPO_DEV_PORTS.has(loc.port)) {
      return `${loc.protocol === "https:" ? "wss" : "ws"}://${loc.host}/ws`;
    }
  }
  return DEFAULT_SOCKET_URL;
}

/** The server's HTTP origin for the admin API, derived from the socket URL. */
export function apiOrigin(loc: LocationLike | null = pageLocation()): string {
  const url = new URL(socketUrl(loc));
  const scheme = url.protocol === "wss:" ? "https:" : "http:";
  return `${scheme}//${url.host}`;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** JSON request to the server. Throws ApiError with the server's message on a non-2xx. */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const response = await fetcher(`${apiOrigin()}${path}`, {
    method: init.method ?? "GET",
    credentials: "include",
    headers: init.body === undefined ? {} : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error: unknown }).error)
        : `HTTP ${response.status}`;
    throw new ApiError(response.status, message);
  }
  return data as T;
}
