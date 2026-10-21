/**
 * The Sotto management server (D-022): accounts, the company's call bundle and usage. Calls run
 * on this device (packages/engine); the server only signs people in and hands out settings.
 *
 * Cloud mode is on when the build names a server (EXPO_PUBLIC_SOTTO_SERVER): the apps, the
 * hosted web app and the Chrome extension. `pnpm demo` and `pnpm dev` leave it off and keep the
 * D-020 local server. This module is the single session store; React reads it via useCloud().
 */
import type { CallBundle } from "@sotto/engine";
import { Platform } from "react-native";
import { clearDeviceCalls, setDeviceOwner } from "./deviceHistory";
import { clearRecordings } from "./recordings";

export type CloudUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "manager" | "agent";
  must_change_password: boolean;
};
export type CloudCompany = {
  id: string;
  name: string;
  plan: string;
  status: "trial" | "active" | "expired" | "suspended";
  days_left: number | null;
  seats: number;
  seats_used: number;
  minutes_month: number;
  minutes_used: number;
  can_call: boolean;
  blocked_reason: string | null;
};
export type Me = { user: CloudUser; company: CloudCompany | null };

export type CloudState =
  | { status: "off" }
  | { status: "loading" }
  | { status: "signed_out"; error?: string }
  | { status: "signed_in"; me: Me; bundle: CallBundle | null };

const TOKEN_KEY = "sotto.token";
const DEVICE_KEY = "sotto.device";

/** The management server, or null when this build has none (local demo, dev). */
export function cloudOrigin(): string | null {
  // Must stay the literal `process.env.EXPO_PUBLIC_…` form so Expo inlines it at build time.
  const value = process.env.EXPO_PUBLIC_SOTTO_SERVER;
  return value && value.length > 0 ? value.replace(/\/+$/, "") : null;
}

export class CloudError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// --- storage: Keychain/Keystore on phones, localStorage on web, desktop and the extension ----
type SecureStore = {
  getItemAsync(k: string): Promise<string | null>;
  setItemAsync(k: string, v: string): Promise<void>;
  deleteItemAsync(k: string): Promise<void>;
};
function secureStore(): SecureStore | null {
  if (Platform.OS === "web") return null;
  // Loaded only on native, so the web bundle never needs it.
  return require("expo-secure-store") as SecureStore;
}
// If secure storage refuses (for example an unsigned test build without Keychain access), the
// session lives in memory for this run instead of leaving the app stuck at start-up.
const memory = new Map<string, string>();
async function read(key: string): Promise<string | null> {
  const store = secureStore();
  try {
    if (store) return (await store.getItemAsync(key)) ?? memory.get(key) ?? null;
    return globalThis.localStorage?.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}
async function write(key: string, value: string | null): Promise<void> {
  if (value === null) memory.delete(key);
  else memory.set(key, value);
  const store = secureStore();
  try {
    if (store) {
      if (value === null) await store.deleteItemAsync(key);
      else await store.setItemAsync(key, value);
    } else if (value === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
  } catch {
    /* storage blocked: the session lasts for this run only */
  }
}

// --- which device this is -------------------------------------------------------------------
type Nav = { userAgent?: string; platform?: string };
export function devicePlatform(): string {
  if (Platform.OS === "ios" || Platform.OS === "android") return Platform.OS;
  const loc = (globalThis as { location?: { protocol?: string } }).location;
  if (loc?.protocol === "chrome-extension:") return "extension";
  const nav = (globalThis as { navigator?: Nav }).navigator;
  const ua = nav?.userAgent ?? "";
  if (/Electron\//.test(ua)) {
    if (/Windows/.test(ua)) return "windows";
    if (/Mac OS X|Macintosh/.test(ua)) return "mac";
    return "linux";
  }
  return "web";
}
function deviceLabel(platform: string): string {
  const ua = (globalThis as { navigator?: Nav }).navigator?.userAgent ?? "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "";
  const names: Record<string, string> = {
    ios: "iPhone",
    android: "Android phone",
    windows: "Windows app",
    mac: "Mac app",
    linux: "Linux app",
    extension: "Chrome extension",
  };
  return names[platform] ?? (browser ? `${browser} browser` : "Web browser");
}
async function deviceId(): Promise<string> {
  let id = await read(DEVICE_KEY);
  if (!id) {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    await write(DEVICE_KEY, id);
  }
  return id;
}
export const APP_VERSION = "0.1.0";

// --- the session store ----------------------------------------------------------------------
let state: CloudState = cloudOrigin() ? { status: "loading" } : { status: "off" };
if (state.status !== "off") setDeviceOwner(null); // nobody's calls until a session loads
let token: string | null = null;
const listeners = new Set<() => void>();
function set(next: CloudState) {
  state = next;
  for (const l of listeners) l();
}
export function cloudState(): CloudState {
  return state;
}
export function subscribeCloud(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
/** Sample calls and answers belong to the local demo only: a build that names a Sotto server is
 * a real product, so its History and Playbook never fall back to another company's samples. */
export function sampleDataAllowed(): boolean {
  return cloudOrigin() === null;
}
export function cloudActive(): boolean {
  return state.status === "signed_in";
}

// Reads are kept briefly so a tab opens from memory; any change clears them (owner, 21 Oct).
const FRESH_MS = 30_000;
const reads = new Map<string, { at: number; value: Promise<unknown> }>();

/** JSON request to the management server with this device's token. */
export async function cloudApi<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
  fetcher: typeof fetch = fetch,
): Promise<T> {
  if ((init.method ?? "GET") !== "GET") {
    reads.clear();
    return request<T>(path, init, fetcher);
  }
  const hit = reads.get(path);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.value as Promise<T>;
  const value = request<T>(path, init, fetcher);
  reads.set(path, { at: Date.now(), value });
  value.catch(() => reads.delete(path));
  return value;
}

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown },
  fetcher: typeof fetch,
): Promise<T> {
  const origin = cloudOrigin();
  if (!origin) throw new CloudError(0, "off", "no Sotto server configured");
  const headers: Record<string, string> = { "x-sotto-platform": devicePlatform() };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  let response: Response;
  try {
    response = await fetcher(`${origin}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new CloudError(0, "offline", "Cannot reach the Sotto server. Check your connection.");
  }
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
  };
  if (!response.ok) {
    if (response.status === 401 && path !== "/api/v1/auth/login") void signedOut();
    throw new CloudError(
      response.status,
      data.code ?? "error",
      data.error ?? `HTTP ${response.status}`,
    );
  }
  return data as T;
}

async function signedOut(error?: string) {
  reads.clear();
  clearDeviceCalls();
  void clearRecordings();
  setDeviceOwner(null);
  token = null;
  await write(TOKEN_KEY, null);
  set(error ? { status: "signed_out", error } : { status: "signed_out" });
}

async function loadSession(): Promise<void> {
  reads.delete("/api/v1/me");
  reads.delete("/api/v1/bundle");
  // Both at once: a person with no company gets a 4xx for the bundle, which we ignore.
  const meRead = cloudApi<Me>("/api/v1/me");
  const bundleRead = cloudApi<CallBundle>("/api/v1/bundle").catch(() => null);
  const me = await meRead;
  const bundle = me.company ? await bundleRead : null;
  setDeviceOwner(me.company?.id ?? "none", me.user.id);
  set({ status: "signed_in", me, bundle });
}

/** Restores a saved session at start-up. */
export async function startCloud(): Promise<void> {
  if (!cloudOrigin()) return;
  token = await read(TOKEN_KEY);
  if (!token) return set({ status: "signed_out" });
  try {
    await loadSession();
  } catch (err) {
    if (err instanceof CloudError && err.status === 401) return;
    // Offline at start: keep the token and let the person retry.
    set({ status: "signed_out", error: err instanceof Error ? err.message : "offline" });
  }
}

async function device() {
  const platform = devicePlatform();
  return { id: await deviceId(), platform, label: deviceLabel(platform), app_version: APP_VERSION };
}

async function adopt(response: { token: string }) {
  token = response.token;
  await write(TOKEN_KEY, token);
  await loadSession();
}

export async function signIn(email: string, password: string): Promise<void> {
  const r = await cloudApi<{ token: string }>("/api/v1/auth/login", {
    method: "POST",
    body: { email, password, device: await device() },
  });
  await adopt(r);
}

export async function signUp(input: {
  company: string;
  name: string;
  email: string;
  password: string;
}): Promise<void> {
  const r = await cloudApi<{ token: string }>("/api/v1/auth/signup", {
    method: "POST",
    body: { ...input, device: await device() },
  });
  await adopt(r);
}

export async function signOut(): Promise<void> {
  try {
    await cloudApi("/api/v1/auth/logout", { method: "POST" });
  } catch {
    /* signed out locally either way */
  }
  await signedOut();
}

/** Re-reads profile, plan and the call bundle (after a settings, key or playbook change). */
export async function refreshCloud(): Promise<void> {
  if (state.status === "signed_in") await loadSession();
}

export async function changePassword(current: string, next: string): Promise<void> {
  await cloudApi("/api/v1/auth/password", { method: "POST", body: { current, new: next } });
  await loadSession();
}
