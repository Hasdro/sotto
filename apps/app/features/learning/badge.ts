/**
 * The "New instructions" badge on the admin Instructions tab (T-060): how many learned versions
 * this admin has not opened yet. Read once per admin visit; opening the tab clears it.
 */
import { useEffect, useSyncExternalStore } from "react";
import { cloudApi } from "../../lib/cloud";

let count = 0;
let loaded = false;
const listeners = new Set<() => void>();

function set(n: number): void {
  count = n;
  for (const fn of listeners) fn();
}

export function clearLearningBadge(): void {
  set(0);
}

/** Tests only. */
export function resetLearningBadge(): void {
  loaded = false;
  set(0);
}

/** `enabled`: only admins with learned instructions available ask the server. */
export function useLearningBadge(enabled: boolean): number {
  const n = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => count,
    () => count,
  );
  useEffect(() => {
    if (!enabled || loaded) return;
    loaded = true;
    cloudApi<{ new: number }>("/api/v1/learning")
      .then((l) => set(l.new))
      .catch(() => {
        loaded = false;
      });
  }, [enabled]);
  return enabled ? n : 0;
}
