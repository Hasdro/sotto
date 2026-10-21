/**
 * This person's settings on this device (owner, 21 Oct): theme, sounds, call pick-up, recording,
 * the microphone, and whether the tutorial was dismissed. Kept in localStorage; a blocked store
 * still works for the visit. React reads it through usePrefs().
 */
import { useSyncExternalStore } from "react";

export type Prefs = {
  theme: "system" | "light" | "dark";
  sounds: boolean;
  autoPickup: boolean;
  /** Desktop: open the floating mini window when a call starts (owner, 22 Oct). */
  miniWindow: boolean;
  record: boolean;
  micId: string | null;
  tutorialDone: boolean;
  playbookHelpSeen: boolean;
};

export const DEFAULT_PREFS: Prefs = {
  theme: "system",
  sounds: true,
  autoPickup: true,
  miniWindow: true,
  record: true,
  micId: null,
  tutorialDone: false,
  playbookHelpSeen: false,
};

const KEY = "sotto.prefs";
const listeners = new Set<() => void>();

function read(): Prefs {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

let current: Prefs = read();

export function prefs(): Prefs {
  return current;
}

export function setPrefs(patch: Partial<Prefs>): void {
  current = { ...current, ...patch };
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage blocked: the change still applies for this visit */
  }
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, prefs, prefs);
}
