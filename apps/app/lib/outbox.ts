/**
 * Persistent offline outbox (S4, §3.5): queues follow-ups, feedback, and diagnostics while offline,
 * survives app restarts, and sends once online with no duplicates.
 */
import { logEvent } from "./obs";

export type OutboxItem<T = unknown> = {
  id: string;
  kind: string;
  payload: T;
  dedupeKey?: string;
  createdAt: number;
  attempts: number;
  lastError?: string;
};

export type OutboxSender = (payload: unknown, item: OutboxItem) => Promise<void>;

export type OutboxStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const STORAGE_KEY = "sotto.outbox.v1";
const MAX_ITEMS = 200;

let storageOverride: OutboxStorage | null = null;
const senders = new Map<string, OutboxSender>();
const listeners = new Set<() => void>();
let flushing: Promise<{ sent: number; failed: number }> | null = null;
let onlineHookInstalled = false;

function store(): OutboxStorage | null {
  if (storageOverride) return storageOverride;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

let memoryFallback: OutboxItem[] = [];

function load(): OutboxItem[] {
  const s = store();
  if (!s) return [...memoryFallback];
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OutboxItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(items: OutboxItem[]): void {
  const trimmed = items.slice(-MAX_ITEMS);
  memoryFallback = trimmed;
  const s = store();
  if (s) {
    try {
      if (trimmed.length === 0) s.removeItem(STORAGE_KEY);
      else s.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // Storage full or unavailable; memory fallback retains items for this run.
    }
  }
  for (const l of listeners) l();
}

function newId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `obx_${Date.now().toString(36)}_${rand}`;
}

/** Register a delivery handler for an outbox item `kind`. */
export function registerOutboxSender(kind: string, sender: OutboxSender): () => void {
  senders.set(kind, sender);
  return () => {
    if (senders.get(kind) === sender) senders.delete(kind);
  };
}

/**
 * Enqueue a payload for reliable delivery (§3.5).
 * If `dedupeKey` matches an item already queued for the same `kind`, returns the existing item id
 * without creating a duplicate.
 */
export function enqueue<T>(kind: string, payload: T, opts?: { dedupeKey?: string }): string {
  const items = load();
  if (opts?.dedupeKey) {
    const existing = items.find((i) => i.kind === kind && i.dedupeKey === opts.dedupeKey);
    if (existing) return existing.id;
  }
  const item: OutboxItem<T> = {
    id: newId(),
    kind,
    payload,
    dedupeKey: opts?.dedupeKey,
    createdAt: Date.now(),
    attempts: 0,
  };
  items.push(item);
  save(items);
  logEvent("outbox", "enqueued", { kind, pending: items.length });
  installOnlineHook();
  return item.id;
}

export function listOutbox(): readonly OutboxItem[] {
  return load();
}

export function outboxCount(): number {
  return load().length;
}

export function subscribeOutbox(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Flush queued items sequentially; single-flight so concurrent calls never double-send. */
export function flushOutbox(): Promise<{ sent: number; failed: number }> {
  if (flushing) return flushing;
  flushing = runFlush().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function runFlush(): Promise<{ sent: number; failed: number }> {
  const items = load();
  if (items.length === 0) return { sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  const remaining: OutboxItem[] = [];
  for (const item of items) {
    const sender = senders.get(item.kind);
    if (!sender) {
      remaining.push(item);
      continue;
    }
    try {
      await sender(item.payload, item);
      sent += 1;
      logEvent("outbox", "sent", { kind: item.kind, attempts: item.attempts + 1 });
    } catch (err) {
      failed += 1;
      remaining.push({
        ...item,
        attempts: item.attempts + 1,
        lastError: err instanceof Error ? err.message : "send failed",
      });
      logEvent("outbox", "retry_later", {
        level: "warn",
        kind: item.kind,
        attempts: item.attempts + 1,
      });
    }
  }
  // Merge any items enqueued while flushing, preserving deduplication.
  const latest = load();
  const seenIds = new Set(items.map((i) => i.id));
  const addedDuringFlush = latest.filter((i) => !seenIds.has(i.id));
  save([...remaining, ...addedDuringFlush]);
  return { sent, failed };
}

function installOnlineHook(): void {
  if (onlineHookInstalled) return;
  const win = globalThis as { addEventListener?: (ev: string, fn: () => void) => void };
  if (typeof win.addEventListener === "function") {
    win.addEventListener("online", () => {
      void flushOutbox();
    });
    onlineHookInstalled = true;
  }
}

/** Test helpers: inject custom storage or reset state between tests. */
export function _setOutboxStorageForTest(s: OutboxStorage | null): void {
  storageOverride = s;
  memoryFallback = [];
}

export function _clearOutboxForTest(): void {
  save([]);
  senders.clear();
}
