/** Notes the agent types during a call (owner, 22 Oct); saved with the call when it ends. */
import { useSyncExternalStore } from "react";

let notes = "";
const listeners = new Set<() => void>();

export function setCallNotes(text: string): void {
  notes = text.slice(0, 4000);
  for (const fn of listeners) fn();
}

/** The notes so far; `take` also clears them for the next call. */
export function callNotes(take = false): string {
  const out = notes;
  if (take) setCallNotes("");
  return out;
}

export function useCallNotes(): string {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => notes,
    () => notes,
  );
}
