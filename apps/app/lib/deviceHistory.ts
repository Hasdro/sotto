/**
 * Calls made on this device (D-022): transcripts stay on the device that made them; the server
 * only receives the numbers (minutes, cards, speed). Web, desktop and the extension keep the
 * last MAX_CALLS in local storage; phones keep them for the session until P5 adds storage.
 *
 * Calls belong to one account (T-022): the key names the company and the user, and signing out
 * clears them, so the next person on a shared computer never sees another account's customers.
 */
import { Platform } from "react-native";

export type DeviceEntry =
  | { kind: "line"; speaker: "customer" | "agent"; text: string; at_ms: number }
  | { kind: "card"; type: string; source: string; text: string; at_ms: number }
  | { kind: "escalation"; text: string; at_ms: number };

export type DeviceCall = {
  id: string;
  started_at: number;
  ended_at: number | null;
  title: string;
  mode: "fake" | "live";
  cards: number;
  p50_ms: number | null;
  p95_ms: number | null;
  transcript: DeviceEntry[];
};

const PREFIX = "sotto.calls";
const LOCAL_OWNER = "local"; // no Sotto server (local demo, dev)
const MAX_CALLS = 30;
let owner: string | null = LOCAL_OWNER;
let memory: DeviceCall[] | null = null;

function storage(): Storage | undefined {
  return Platform.OS === "web" ? globalThis.localStorage : undefined;
}

function key(): string | null {
  return owner ? `${PREFIX}.${owner}` : null;
}

/** The account whose calls are shown and saved; null while nobody is signed in. */
export function setDeviceOwner(companyId: string | null, userId?: string): void {
  const next = companyId && userId ? `${companyId}.${userId}` : null;
  if (next === owner) return;
  owner = next;
  memory = null;
  try {
    storage()?.removeItem(PREFIX); // calls saved before T-022 under one shared key: discard
  } catch {
    /* storage blocked */
  }
}

/** Forgets this account's calls on this device (sign-out). */
export function clearDeviceCalls(): void {
  const k = key();
  memory = null;
  try {
    if (k) storage()?.removeItem(k);
  } catch {
    /* storage blocked */
  }
}

function load(): DeviceCall[] {
  if (memory) return memory;
  memory = [];
  const k = key();
  try {
    const raw = k ? storage()?.getItem(k) : null;
    if (raw) memory = JSON.parse(raw) as DeviceCall[];
  } catch {
    memory = [];
  }
  return memory;
}

export function saveDeviceCall(call: DeviceCall): void {
  const calls = [call, ...load().filter((c) => c.id !== call.id)].slice(0, MAX_CALLS);
  memory = calls;
  const k = key();
  try {
    if (k) storage()?.setItem(k, JSON.stringify(calls));
  } catch {
    /* storage full or blocked: the call stays in memory for this visit */
  }
}

export function deviceCalls(): Omit<DeviceCall, "transcript">[] {
  return load().map(({ transcript: _t, ...summary }) => summary);
}

export function deviceCall(id: string): DeviceCall | null {
  return load().find((c) => c.id === id) ?? null;
}
