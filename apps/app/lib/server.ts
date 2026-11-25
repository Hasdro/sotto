/**
 * Where the Sotto server is (D-020). The web app is normally served BY the server (`pnpm demo`
 * locally, or the hosted server), so it talks to its own origin. Under the Expo dev server
 * (ports 8081/19006) and on native, it uses EXPO_PUBLIC_DEMO_BRIDGE_URL or the local default.
 */
import { DEMO_DEFAULT_PORT } from "@sotto/shared";
import { CloudError, cloudActive, cloudOrigin, DEFAULT_TIMEOUT_MS, RETRY_DELAYS_MS } from "./cloud";
import { CompatError, cloudCompat } from "./cloudCompat";
import { logEvent } from "./obs";

export const DEFAULT_SOCKET_URL = `ws://127.0.0.1:${DEMO_DEFAULT_PORT}/ws`;
const EXPO_DEV_PORTS = new Set(["8081", "19006"]);
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "PUT", "DELETE", "OPTIONS"]);
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type ApiInit = {
  method?: string;
  body?: unknown;
  timeoutMs?: number;
  idempotent?: boolean;
  retryDelaysMs?: readonly number[];
};

/** JSON request to the server. Throws ApiError with a plain message on timeout, offline, or non-2xx.
 * Signed in to the management server (D-022), the same paths are answered by cloudCompat. */
export async function api<T>(
  path: string,
  init: ApiInit = {},
  fetcher: typeof fetch = fetch,
): Promise<T> {
  if (cloudOrigin() && !cloudActive()) throw new ApiError(401, "sign in first");
  if (cloudActive()) {
    try {
      return (await cloudCompat(path, init)) as T;
    } catch (err) {
      const status = err instanceof CompatError || err instanceof CloudError ? err.status : 500;
      throw new ApiError(status, err instanceof Error ? err.message : "request failed");
    }
  }
  const method = (init.method ?? "GET").toUpperCase();
  const canRetry = init.idempotent ?? IDEMPOTENT_METHODS.has(method);
  const delays = canRetry ? (init.retryDelaysMs ?? RETRY_DELAYS_MS).slice(0, 2) : [];
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timedOut = false;
    const timer =
      controller && timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, timeoutMs)
        : null;
    try {
      const response = await fetcher(`${apiOrigin()}${path}`, {
        method,
        credentials: "include",
        headers: init.body === undefined ? {} : { "content-type": "application/json" },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller?.signal,
      });
      if (timer) clearTimeout(timer);
      const data: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (attempt < delays.length && RETRYABLE_STATUS.has(response.status)) {
          logEvent("net.server", "retry", {
            level: "warn",
            status: response.status,
            attempt: attempt + 1,
          });
          await sleep(delays[attempt] ?? 0);
          continue;
        }
        const message =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error: unknown }).error)
            : response.status >= 500
              ? "The server hit a temporary problem. Please try again in a moment."
              : `HTTP ${response.status}`;
        throw new ApiError(response.status, message);
      }
      return data as T;
    } catch (err) {
      if (timer) clearTimeout(timer);
      if (err instanceof ApiError) throw err;
      if (attempt < delays.length) {
        logEvent("net.server", "retry_network", {
          level: "warn",
          timed_out: timedOut,
          attempt: attempt + 1,
        });
        await sleep(delays[attempt] ?? 0);
        continue;
      }
      throw new ApiError(
        0,
        timedOut
          ? "The request took too long. Check your connection and try again."
          : "Cannot reach the Sales Shield server. Check your connection.",
      );
    }
  }
  throw new ApiError(0, "Cannot reach the Sales Shield server. Check your connection.");
}
