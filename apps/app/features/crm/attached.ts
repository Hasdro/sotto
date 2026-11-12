/**
 * The CRM record attached to the current call (R10). Only the agent's explicit pick sets it; the
 * live engine reads `attachedBriefText()` on every customer sentence (packages/engine crmBrief).
 */
import { useSyncExternalStore } from "react";
import type { Brief } from "./api";

export type Attached = { kind: "none" } | { kind: "skipped" } | { kind: "attached"; brief: Brief };

let current: Attached = { kind: "none" };
const listeners = new Set<() => void>();

function set(next: Attached): void {
  current = next;
  for (const fn of listeners) fn();
}

export const attachBrief = (brief: Brief) => set({ kind: "attached", brief });
export const skipCrm = () => set({ kind: "skipped" });
export const clearCrm = () => set({ kind: "none" });

export function attachedBriefText(): string {
  return current.kind === "attached" ? current.brief.text : "";
}

export function useAttached(): Attached {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
    () => current,
  );
}
