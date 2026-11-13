/**
 * The Sotto management server (D-022): accounts, the company's call bundle and usage. Calls run
 * on this device (packages/engine); the server only signs people in and hands out settings.
 *
 * Cloud mode is on when the build names a server (EXPO_PUBLIC_SOTTO_SERVER): the apps, the
 * hosted web app and the Chrome extension. `pnpm demo` and `pnpm dev` leave it off and keep the
 * D-020 local server. This module is the single session store; React reads it via useCloud().
 */
import type { CallBundle } from "@sotto/engine";
import { AppState, Platform } from "react-native";
import type { FeatureMap } from "../features/flags/catalog";
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
export type Me = { user: CloudUser; company: CloudCompany | null; features?: FeatureMap };

export type CloudState =
  | { status: "off" }
  | { status: "loading" }
  | { status: "signed_out"; error?: string }
  /** `offline`: started without the server; the last profile is shown and retried (D-029). */
  | { status: "signed_in"; me: Me; bundle: CallBundle | null; offline?: boolean };

/** The 0.2.0 single 30-day token (localStorage on desktop and web); migrated once (D-029). */
const LEGACY_TOKEN_KEY = "sotto.token";
/** The refresh-token session (D-029): OS secure storage on desktop and phones. */
const SESSION_KEY = "sotto.session";
const DEVICE_KEY = "sotto.device";
/** Renew this long before the access token ends, so a request never meets an expired one. */
const RENEW_EARLY_MS = 60_000;
/** The feature map is re-read this often and when the app comes to the front (D-036). */
export const FEATURES_EVERY_MS = 10 * 60_000;
const FOCUS_MIN_GAP_MS = 60_000;

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
/** True when the value reached lasting storage (not just this run's memory). */
async function write(key: string, value: string | null): Promise<boolean> {
  if (value === null) memory.delete(key);
  else memory.set(key, value);
  const store = secureStore();
  try {
    if (store) {
      if (value === null) await store.deleteItemAsync(key);
      else await store.setItemAsync(key, value);
    } else if (globalThis.localStorage) {
      if (value === null) globalThis.localStorage.removeItem(key);
      else globalThis.localStorage.setItem(key, value);
    } else return false;
    return true;
  } catch {
    return false; // storage blocked: the session lasts for this run only
  }
}

// --- the session's own storage: Electron safeStorage on desktop (Keychain / Credential Manager),
// expo-secure-store on phones, localStorage only in a plain browser (D-029) ------------------
type DesktopSecureStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<boolean>;
  delete(key: string): Promise<void>;
};
function desktopSecure(): DesktopSecureStore | null {
  const bridge = (globalThis as { sottoDesktop?: { secureStore?: DesktopSecureStore } })
    .sottoDesktop;
  return bridge?.secureStore ?? null;
}
async function readSecret(key: string): Promise<string | null> {
  const desk = desktopSecure();
  if (!desk) return read(key);
  try {
    return (await desk.get(key)) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}
/** True when the value reached lasting secure storage. */
async function writeSecret(key: string, value: string | null): Promise<boolean> {
  const desk = desktopSecure();
  if (!desk) return write(key, value);
  if (value === null) memory.delete(key);
  else memory.set(key, value);
  try {
    // Never falls back to localStorage: without OS encryption the session lasts this run only.
    if (value === null) {
      await desk.delete(key);
      return true;
    }
    return (await desk.set(key, value)) === true;
  } catch {
    return false; // secure storage unavailable: memory only
  }
}

/** Whether a session can outlive this run here (desktop without OS encryption cannot). */
async function canKeepSecrets(): Promise<boolean> {
  const desk = desktopSecure();
  if (!desk) return true;
  try {
    const ok = (await desk.set("sotto.probe", "1")) === true;
    if (ok) await desk.delete("sotto.probe");
    return ok;
  } catch {
    return false;
  }
}

type Tokens = {
  access: string;
  refresh: string | null; // null: a 0.2.0 token not migrated yet
  access_expires_at: number | null;
  me?: Me; // the last profile, so an offline start still opens the app
};
type PairResponse = {
  token: string;
  refresh_token?: string;
  access_expires_at?: number;
};
async function loadTokens(): Promise<Tokens | null> {
  const raw = await readSecret(SESSION_KEY);
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as Tokens;
    return typeof t.access === "string" ? t : null;
  } catch {
    return null;
  }
}
async function saveTokens(next: Tokens | null): Promise<boolean> {
  tokens = next;
  return writeSecret(SESSION_KEY, next ? JSON.stringify(next) : null);
}
function tokensFrom(r: PairResponse, me?: Me): Tokens {
  return {
    access: r.token,
    refresh: r.refresh_token ?? null,
    access_expires_at: r.access_expires_at ?? null,
    ...(me ? { me } : {}),
  };
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
export const APP_VERSION = "0.3.1";

// --- the session store ----------------------------------------------------------------------
let state: CloudState = cloudOrigin() ? { status: "loading" } : { status: "off" };
if (state.status !== "off") setDeviceOwner(null); // nobody's calls until a session loads
let tokens: Tokens | null = null;
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
  init: { method?: string; body?: unknown; raw?: Blob } = {},
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

/** A file from the management server (a call recording), or null if there is none. */
export async function cloudBlob(path: string, fetcher: typeof fetch = fetch): Promise<Blob | null> {
  const origin = cloudOrigin();
  await renewIfDue(fetcher);
  if (!origin || !tokens) return null;
  try {
    const r = await fetcher(`${origin}${path}`, {
      headers: { authorization: `Bearer ${tokens.access}`, "x-sotto-platform": devicePlatform() },
    });
    return r.ok ? await r.blob() : null;
  } catch {
    return null;
  }
}

const AUTH_PATHS = new Set(["/api/v1/auth/login", "/api/v1/auth/signup", "/api/v1/auth/refresh"]);

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown; raw?: Blob },
  fetcher: typeof fetch,
  retried = false,
): Promise<T> {
  const origin = cloudOrigin();
  if (!origin) throw new CloudError(0, "off", "no Sales Shield server configured");
  if (!AUTH_PATHS.has(path)) await renewIfDue(fetcher);
  const headers: Record<string, string> = { "x-sotto-platform": devicePlatform() };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.raw) headers["content-type"] = init.raw.type || "application/octet-stream";
  if (tokens && !AUTH_PATHS.has(path)) headers.authorization = `Bearer ${tokens.access}`;
  let response: Response;
  try {
    response = await fetcher(`${origin}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.raw ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
    });
  } catch {
    throw new CloudError(
      0,
      "offline",
      "Cannot reach the Sales Shield server. Check your connection.",
    );
  }
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
  };
  if (!response.ok) {
    // D-029: only the server saying "this session is over" signs out; a network error or a
    // 5xx never does. An expired access token is renewed once and the request repeated.
    if (response.status === 401 && !AUTH_PATHS.has(path)) {
      const ended: Ended = data.code === "device_removed" ? "device_removed" : "signed_out";
      const renewed = !retried && tokens?.refresh ? await renew(fetcher) : ended;
      if (renewed === "ok") return request<T>(path, init, fetcher, true);
      if (renewed !== "offline") void signedOut({ wipe: renewed === "device_removed" });
      else
        throw new CloudError(
          0,
          "offline",
          "Cannot reach the Sales Shield server. Check your connection.",
        );
    }
    throw new CloudError(
      response.status,
      data.code ?? "error",
      data.error ?? `HTTP ${response.status}`,
    );
  }
  return data as T;
}

/** How the server ended a session: only a removed device wipes its calls (D-029 amendment). */
type Ended = "signed_out" | "device_removed";
type Renewal = "ok" | "offline" | Ended;
let renewing: Promise<Renewal> | null = null;

/** Spends the refresh token for a new pair; one at a time, so a token is never sent twice. */
function renew(fetcher: typeof fetch): Promise<Renewal> {
  if (!renewing) {
    renewing = withRenewLock(() => renewNow(fetcher)).finally(() => {
      renewing = null;
    });
  }
  return renewing;
}

type Locks = { request<T>(name: string, fn: () => Promise<T>): Promise<T> };
/** Web tabs share one session: only one renews at a time, and the next sees its result. */
function withRenewLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (globalThis as { navigator?: { locks?: Locks } }).navigator?.locks;
  return locks ? locks.request("sotto.renew", fn) : fn();
}

async function renewNow(fetcher: typeof fetch): Promise<Renewal> {
  const origin = cloudOrigin();
  const held = tokens;
  if (!origin || !held?.refresh) return "signed_out";
  // Another window of this app may have renewed already (web tabs share storage).
  const stored = await loadTokens();
  if (stored?.refresh && stored.refresh !== held.refresh) {
    tokens = { ...stored, me: stored.me ?? held.me };
    return "ok";
  }
  let response: Response;
  try {
    response = await fetcher(`${origin}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-sotto-platform": devicePlatform() },
      body: JSON.stringify({ refresh_token: held.refresh }),
    });
  } catch {
    return "offline";
  }
  if (response.status === 401) {
    const body = (await response.json().catch(() => ({}))) as { code?: string };
    return body.code === "device_removed" ? "device_removed" : "signed_out";
  }
  if (!response.ok) return "offline";
  const pair = (await response.json().catch(() => null)) as PairResponse | null;
  if (!pair?.token) return "offline";
  await saveTokens(tokensFrom(pair, held.me));
  return "ok";
}

async function renewIfDue(fetcher: typeof fetch): Promise<void> {
  const t = tokens;
  if (!t?.refresh || t.access_expires_at === null) return;
  if (Date.now() < t.access_expires_at - RENEW_EARLY_MS) return;
  const result = await renew(fetcher);
  if (result === "signed_out" || result === "device_removed") {
    await signedOut({ wipe: result === "device_removed" });
  }
}

/** Ends the session here. This device's calls and recordings (kept per account) are deleted only
 * on a manual sign-out or when the device was removed; a revoke, a reused token or 90 days
 * unused keep them for the next sign-in of the same account (D-029 amendment). */
async function signedOut({ wipe = false, error }: { wipe?: boolean; error?: string } = {}) {
  reads.clear();
  if (wipe) {
    clearDeviceCalls();
    void clearRecordings();
  }
  setDeviceOwner(null);
  await saveTokens(null);
  await write(LEGACY_TOKEN_KEY, null);
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
  // A 0.2.0 token stays under its own key until migration saves a pair (D-029).
  if (tokens?.refresh) await saveTokens({ ...tokens, me });
  else if (tokens) tokens = { ...tokens, me };
  set({ status: "signed_in", me, bundle });
  watchFeatures();
}

/** 0.2.0 kept one 30-day token; exchange it once for a pair, with no new sign-in (D-029). */
async function migrateLegacy(): Promise<void> {
  const legacy = await read(LEGACY_TOKEN_KEY);
  if (!legacy) return;
  tokens = { access: legacy, refresh: null, access_expires_at: null };
  // A pair that cannot be kept would be lost at quit, and by then the server has retired the
  // 0.2.0 token: keep using that token instead until it ends (D-029).
  if (!(await canKeepSecrets())) return;
  try {
    const pair = await cloudApi<PairResponse>("/api/v1/auth/migrate", { method: "POST" });
    if (await saveTokens(tokensFrom(pair))) await write(LEGACY_TOKEN_KEY, null);
  } catch {
    // Offline, busy, or the answer was lost: the 0.2.0 token still works and the server answers
    // a repeat migration while the new pair is unused; try again next start.
  }
}

/** Restores a saved session at start-up. */
export async function startCloud(): Promise<void> {
  if (!cloudOrigin()) return;
  tokens = await loadTokens();
  if (!tokens) await migrateLegacy();
  if (!tokens) return set({ status: "signed_out" });
  try {
    await loadSession();
  } catch (err) {
    if (state.status === "signed_out") return; // the server ended the session
    if (!tokens) return;
    // Offline or a server error at start: stay signed in with the last profile (D-029).
    const cached = tokens.me;
    if (cached) {
      setDeviceOwner(cached.company?.id ?? "none", cached.user.id);
      set({ status: "signed_in", me: cached, bundle: null, offline: true });
      watchFeatures();
      return;
    }
    set({ status: "signed_out", error: err instanceof Error ? err.message : "offline" });
  }
}

// --- the feature map: on sign-in, on focus and every 10 minutes (D-036) ---------------------
let watching = false;
let lastCheck = 0;

/** Re-reads the feature map (and, after an offline start, the whole session). */
export async function refreshFeatures(): Promise<void> {
  if (state.status !== "signed_in") return;
  lastCheck = Date.now();
  try {
    if (state.offline) return await loadSession();
    const r = await cloudApi<{ features: FeatureMap; learned_version?: number | null }>(
      "/api/v1/features",
    );
    reads.delete("/api/v1/features");
    if (state.status !== "signed_in") return;
    // R11: a new learned-instructions version reaches the bundle too, between calls only.
    const learned =
      r.learned_version !== undefined &&
      (state.bundle?.learned?.version ?? null) !== (r.learned_version ?? null);
    const changed =
      learned || JSON.stringify(state.me.features ?? {}) !== JSON.stringify(r.features);
    set({ ...state, me: { ...state.me, features: r.features } });
    // D-036: what a switched-off feature needs (company knowledge, keys) leaves the device too.
    if (changed) {
      bundleStale = true;
      if (!callLive) await reloadBundle();
    }
  } catch {
    /* offline: keep the map we have and try again later */
  }
}

let callLive = false;
let bundleStale = false;

/** The call engine says when a call is on: the bundle is never swapped during one. */
export function setCallLive(on: boolean): void {
  callLive = on;
  if (!on && bundleStale) void reloadBundle();
}

async function reloadBundle(): Promise<void> {
  if (state.status !== "signed_in" || !state.me.company) return;
  reads.delete("/api/v1/bundle");
  try {
    const bundle = await cloudApi<CallBundle>("/api/v1/bundle");
    bundleStale = false;
    if (state.status === "signed_in") set({ ...state, bundle });
  } catch {
    /* offline: the next check tries again */
  }
}

function watchFeatures(): void {
  if (watching) return;
  watching = true;
  const timer = setInterval(() => void refreshFeatures(), FEATURES_EVERY_MS);
  (timer as { unref?: () => void }).unref?.(); // never keeps a test run or app exit waiting
  const onFront = () => {
    if (Date.now() - lastCheck >= FOCUS_MIN_GAP_MS) void refreshFeatures();
  };
  const win = globalThis as { addEventListener?: (e: string, f: () => void) => void };
  if (Platform.OS === "web") win.addEventListener?.("focus", onFront);
  else AppState.addEventListener("change", (s) => s === "active" && onFront());
}

async function device() {
  const platform = devicePlatform();
  return { id: await deviceId(), platform, label: deviceLabel(platform), app_version: APP_VERSION };
}

async function adopt(response: PairResponse) {
  if (await saveTokens(tokensFrom(response))) await write(LEGACY_TOKEN_KEY, null);
  await loadSession();
}

export async function signIn(email: string, password: string): Promise<void> {
  const r = await cloudApi<PairResponse>("/api/v1/auth/login", {
    method: "POST",
    body: { email, password, device: await device(), session: "pair" },
  });
  await adopt(r);
}

export async function signUp(input: {
  company: string;
  name: string;
  email: string;
  password: string;
}): Promise<void> {
  const r = await cloudApi<PairResponse>("/api/v1/auth/signup", {
    method: "POST",
    body: { ...input, device: await device(), session: "pair" },
  });
  await adopt(r);
}

export async function signOut(): Promise<void> {
  try {
    await cloudApi("/api/v1/auth/logout", { method: "POST" });
  } catch {
    /* signed out locally either way */
  }
  await signedOut({ wipe: true });
}

/** Re-reads profile, plan and the call bundle (after a settings, key or playbook change). */
export async function refreshCloud(): Promise<void> {
  if (state.status === "signed_in") await loadSession();
}

export async function changePassword(current: string, next: string): Promise<void> {
  await cloudApi("/api/v1/auth/password", { method: "POST", body: { current, new: next } });
  await loadSession();
}
