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

import type { CallReview } from "@sotto/engine";
import { useSyncExternalStore } from "react";
import type { CallSource } from "./callSource";

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
  /** Where the call came from: Zoom, Teams, the microphone… (owner, 22 Oct). */
  source?: CallSource;
  /** What the agent typed during the call (owner, 22 Oct). */
  notes?: string;
  /** The after-call review (owner, 21 Oct); null when it could not be made. */
  review?: CallReview | null;
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

/** Every call on this device, words included (search and objections, owner 22 Oct). */
export function allDeviceCalls(): readonly DeviceCall[] {
  return load();
}

export function deviceCall(id: string): DeviceCall | null {
  return load().find((c) => c.id === id) ?? null;
}

// --- after-call reviews: written once the summary model answers; screens re-render on change ---
const reviewing = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
const changed = () => {
  version += 1;
  for (const fn of listeners) fn();
};

export function markReviewing(id: string): void {
  reviewing.add(id);
  changed();
}

export function setDeviceReview(id: string, review: CallReview | null): void {
  reviewing.delete(id);
  const call = deviceCall(id);
  if (call) saveDeviceCall({ ...call, review });
  changed();
}

export type ReviewState =
  | { status: "pending" }
  | { status: "ready"; review: CallReview }
  | { status: "none" };

export function reviewState(id: string): ReviewState {
  if (reviewing.has(id)) return { status: "pending" };
  const review = deviceCall(id)?.review;
  return review ? { status: "ready", review } : { status: "none" };
}

/** The review of one call, for React; re-renders when it arrives. */
export function useReview(id: string | null): ReviewState {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => version,
    () => version,
  );
  return id ? reviewState(id) : { status: "none" };
}
