import { isAutoTitle } from "../history/title";

/**
 * UX-31: what a pending version changes against the active list, line by line: kept, added
 * (new text) or removed. Order follows the pending list, then what it drops.
 */
export type DiffLine = { kind: "same" | "added" | "removed"; text: string };

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export function diffInstructions(
  active: readonly string[],
  pending: readonly string[],
): DiffLine[] {
  const before = new Set(active.map(norm));
  const after = new Set(pending.map(norm));
  return [
    ...pending.map((text): DiffLine => ({ kind: before.has(norm(text)) ? "same" : "added", text })),
    ...active
      .filter((text) => !after.has(norm(text)))
      .map((text): DiffLine => ({ kind: "removed", text })),
  ];
}

/** UX-31: the word counter shows only once an instruction is long (over 20 words). */
export const COUNTER_FROM_WORDS = 20;

/** UX-06c: "From the call with Sara, 12 Nov" when the call has a name; else "From a call, …".
 * An old "Call 11/14/2026, 9:46:45 AM" title is no name (UX-009). */
export function sourceName(
  item: { source_call: string | null; source_label?: string },
  titleOf: (callId: string) => string | undefined,
): string | null {
  if (!item.source_call) return null;
  const name = item.source_label?.trim() || titleOf(item.source_call)?.trim() || "";
  return isAutoTitle(name) ? "" : name;
}
