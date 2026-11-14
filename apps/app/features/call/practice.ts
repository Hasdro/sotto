/**
 * Practice call in a real account (D-073, owner Q15, T-038): one neutral scripted call from
 * `seed/practice/practice.json`, shipped in the session bundle as `bundle.practice`. It runs on
 * the same engine as a real call, so the cards are the company's own; it is labelled
 * "Practice" and leaves nothing behind: no History entry, no review, no learning, no ratings,
 * no escalation, and nothing about it reaches the server (local.ts checks `practiceRun()`).
 */
import type { CallBundle, Scenario } from "@sotto/engine";
import { useSyncExternalStore } from "react";

/** Scenario ids with this prefix are practice runs; the hello list never shows them. */
export const PRACTICE_PREFIX = "practice:";

/** The practice script in this bundle (absent from an older server), with its run id. */
export function practiceScenario(bundle: CallBundle | null | undefined): Scenario | null {
  const raw = (bundle as { practice?: unknown } | null | undefined)?.practice;
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<Scenario>;
  if (typeof s.id !== "string" || !Array.isArray(s.lines) || s.lines.length === 0) return null;
  return { id: `${PRACTICE_PREFIX}${s.id}`, title: String(s.title ?? s.id), lines: s.lines };
}

export const isPracticeId = (id: string | null | undefined): boolean =>
  Boolean(id?.startsWith(PRACTICE_PREFIX));

let running = false;
const listeners = new Set<() => void>();

/** True from a practice start until the next real call starts (it stays true once it ended,
 * so the after-call view still knows it was practice). */
export function practiceRun(): boolean {
  return running;
}

export function setPracticeRun(on: boolean): void {
  if (on === running) return;
  running = on;
  for (const fn of listeners) fn();
}

export function usePracticeRun(): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    practiceRun,
    practiceRun,
  );
}
