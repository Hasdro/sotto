/**
 * Client observability (S2, L5): metadata-only event logging with strict redaction
 * and a local safety copy for critical errors (≤ 5 MB / 7 days) plus diagnostics export.
 *
 * Contract (§3.4 / §3.5):
 *   logEvent(stage, event, meta?)
 */

export type ObsLevel = "info" | "warn" | "error";
export type ObsMetaValue = string | number | boolean | null | undefined;
export type ObsMeta = {
  callId?: string | null;
  level?: ObsLevel;
  durationMs?: number | null;
  [key: string]: ObsMetaValue;
};

export type ObsEvent = {
  tsMs: number;
  stage: string;
  event: string;
  level: ObsLevel;
  callId: string | null;
  durationMs: number | null;
  meta: Record<string, string | number | boolean>;
};

const BLOCKED_KEYS = new Set([
  "transcript",
  "transcript_text",
  "customer_text",
  "agent_text",
  "utterance",
  "speech",
  "prompt",
  "prompt_text",
  "response_text",
  "completion",
  "reply_text",
  "card_text",
  "body",
  "content",
  "message_text",
  "name",
  "customer_name",
  "full_name",
  "first_name",
  "last_name",
  "contact_name",
  "phone",
  "phone_number",
  "mobile",
  "tel",
  "email",
  "email_address",
  "customer_email",
  "api_key",
  "apikey",
  "key",
  "secret",
  "token",
  "access_token",
  "refresh_token",
  "password",
  "passwd",
  "authorization",
  "cookie",
  "bearer",
  "private_key",
  "audio",
  "pcm",
]);

const BLOCKED_SUBSTRINGS = [
  "transcript",
  "secret",
  "access_token",
  "refresh_token",
  "auth_token",
  "password",
  "api_key",
  "apikey",
  "cookie",
  "customer_name",
  "phone",
  "email",
];

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_RE = /(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)/g;
const KEY_RE =
  /\b(?:sk-[A-Za-z0-9_-]{12,}|sk-ant-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{16,}|gho_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,}|AIza[0-9A-Za-z_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|Bearer\s+[A-Za-z0-9._~+/=-]{12,})\b/gi;

const MAX_STR_LEN = 256;
const MAX_RING = 200;
const SAFETY_STORAGE_KEY = "sotto.safety_log";
export const SAFETY_MAX_BYTES = 5 * 1024 * 1024; // 5 MB (L5)
export const SAFETY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (L5)

const ring: ObsEvent[] = [];
const listeners = new Set<(ev: ObsEvent) => void>();

function isBlockedKey(key: string): boolean {
  const low = key.toLowerCase().trim();
  if (BLOCKED_KEYS.has(low)) return true;
  return BLOCKED_SUBSTRINGS.some((sub) => low.includes(sub));
}

export function redactText(value: string): string {
  let cleaned = value
    .replace(KEY_RE, "[REDACTED_KEY]")
    .replace(EMAIL_RE, "[REDACTED_EMAIL]")
    .replace(PHONE_RE, "[REDACTED_PHONE]");
  if (cleaned.length > MAX_STR_LEN) cleaned = `${cleaned.slice(0, MAX_STR_LEN)}…`;
  return cleaned;
}

export function redactMeta(meta: Record<string, ObsMetaValue>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (k === "callId" || k === "level" || k === "durationMs") continue;
    if (v === null || v === undefined) continue;
    if (isBlockedKey(k)) continue;
    if (typeof v === "boolean" || typeof v === "number") out[k] = v;
    else if (typeof v === "string") out[k] = redactText(v);
  }
  return out;
}

type DesktopObsBridge = {
  logCritical?: (entry: ObsEvent) => Promise<void> | void;
  readDiagnostics?: () => Promise<string>;
};

function desktopObs(): DesktopObsBridge | null {
  return (globalThis as { sottoDesktop?: DesktopObsBridge }).sottoDesktop ?? null;
}

function persistCriticalLocal(entry: ObsEvent, now = Date.now()): void {
  const bridge = desktopObs();
  if (bridge?.logCritical) {
    try {
      void bridge.logCritical(entry);
    } catch {
      // Never throw from logging
    }
  }
  try {
    const ls = globalThis.localStorage;
    if (!ls) return;
    const raw = ls.getItem(SAFETY_STORAGE_KEY);
    const parsed: ObsEvent[] = raw ? (JSON.parse(raw) as ObsEvent[]) : [];
    const cutoff = now - SAFETY_MAX_AGE_MS;
    const kept = parsed.filter((e) => typeof e?.tsMs === "number" && e.tsMs >= cutoff);
    kept.push(entry);
    // Keep within 5 MB ceiling by dropping oldest entries first.
    let serialized = JSON.stringify(kept);
    while (serialized.length > SAFETY_MAX_BYTES && kept.length > 1) {
      kept.shift();
      serialized = JSON.stringify(kept);
    }
    ls.setItem(SAFETY_STORAGE_KEY, serialized);
  } catch {
    // Storage quota or unavailable — ring buffer still holds the event.
  }
}

export function logEvent(stage: string, event: string, meta: ObsMeta = {}): void {
  const now = Date.now();
  const level: ObsLevel = meta.level ?? "info";
  const entry: ObsEvent = {
    tsMs: now,
    stage: redactText(stage),
    event: redactText(event),
    level,
    callId: meta.callId ? redactText(String(meta.callId)) : null,
    durationMs: typeof meta.durationMs === "number" ? meta.durationMs : null,
    meta: redactMeta(meta),
  };
  ring.push(entry);
  if (ring.length > MAX_RING) ring.shift();
  if (level === "error") persistCriticalLocal(entry, now);
  for (const l of listeners) {
    try {
      l(entry);
    } catch {
      // Listeners must never crash the caller.
    }
  }
}

export function recentEvents(limit = 50): readonly ObsEvent[] {
  if (limit <= 0) return [];
  return ring.slice(-limit);
}

export function clearEvents(): void {
  ring.length = 0;
}

export function subscribeEvents(fn: (ev: ObsEvent) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Read local critical safety log entries (L5), pruned to 7 days. */
export function readSafetyLog(now = Date.now()): ObsEvent[] {
  try {
    const raw = globalThis.localStorage?.getItem(SAFETY_STORAGE_KEY);
    if (!raw) return [];
    const cutoff = now - SAFETY_MAX_AGE_MS;
    const parsed = JSON.parse(raw) as ObsEvent[];
    return Array.isArray(parsed)
      ? parsed.filter((e) => typeof e?.tsMs === "number" && e.tsMs >= cutoff)
      : [];
  } catch {
    return [];
  }
}

/** Redacted diagnostics string for Help → "Copy diagnostics" (L5). */
export async function buildDiagnosticsText(extra?: Record<string, string | number | boolean>): Promise<string> {
  const bridge = desktopObs();
  let desktopLog = "";
  if (bridge?.readDiagnostics) {
    try {
      desktopLog = await bridge.readDiagnostics();
    } catch {
      desktopLog = "";
    }
  }
  const summary = {
    generatedAt: new Date().toISOString(),
    env: extra ? redactMeta(extra) : {},
    recentErrors: readSafetyLog().slice(-25),
    recentEvents: ring.slice(-30),
    desktopLog: desktopLog ? redactText(desktopLog) : undefined,
  };
  return JSON.stringify(summary, null, 2);
}
