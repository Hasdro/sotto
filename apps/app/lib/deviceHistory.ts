/**
 * Calls made on this device (D-022): transcripts stay on the device that made them; the server
 * only receives the numbers (minutes, cards, speed). Web, desktop and the extension keep the
 * last MAX_CALLS in local storage; phones keep them for the session until P5 adds storage.
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

const KEY = "sotto.calls";
const MAX_CALLS = 30;
let memory: DeviceCall[] | null = null;

function load(): DeviceCall[] {
  if (memory) return memory;
  memory = [];
  if (Platform.OS === "web") {
    try {
      const raw = globalThis.localStorage?.getItem(KEY);
      if (raw) memory = JSON.parse(raw) as DeviceCall[];
    } catch {
      memory = [];
    }
  }
  return memory;
}

export function saveDeviceCall(call: DeviceCall): void {
  const calls = [call, ...load().filter((c) => c.id !== call.id)].slice(0, MAX_CALLS);
  memory = calls;
  if (Platform.OS === "web") {
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify(calls));
    } catch {
      /* storage full or blocked: the call stays in memory for this visit */
    }
  }
}

export function deviceCalls(): Omit<DeviceCall, "transcript">[] {
  return load().map(({ transcript: _t, ...summary }) => summary);
}

export function deviceCall(id: string): DeviceCall | null {
  return load().find((c) => c.id === id) ?? null;
}
