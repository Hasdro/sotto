/**
 * Escalation → playbook (R2 steps 4–5), on the mock store until Phase 5 wires Supabase.
 * The rules mirror `approve_escalation()` (supabase/migrations/…_escalation_approval.sql):
 * 1–25 words, added once, and adding writes the inbox status and the playbook entry together.
 */
import type { InboxItem } from "../inbox/mock";
import type { PlaybookEntry } from "../playbook/mock";

export const MAX_ANSWER_WORDS = 25;

export type EscalationState = {
  inbox: readonly InboxItem[];
  playbook: readonly PlaybookEntry[];
};

export type FlowError = "not_found" | "already_added" | "empty" | "too_long";
export type FlowResult = { ok: true; state: EscalationState } | { ok: false; error: FlowError };

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function check(state: EscalationState, id: string, answer: string): FlowError | null {
  const item = state.inbox.find((i) => i.id === id);
  if (!item) return "not_found";
  if (item.status === "added") return "already_added";
  const words = wordCount(answer);
  if (words === 0) return "empty";
  if (words > MAX_ANSWER_WORDS) return "too_long";
  return null;
}

function withItem(state: EscalationState, id: string, patch: Partial<InboxItem>) {
  return state.inbox.map((i) => (i.id === id ? { ...i, ...patch } : i));
}

/** Store the manager's answer; the question stays out of the playbook until it is added. */
export function saveAnswer(state: EscalationState, id: string, answer: string): FlowResult {
  const error = check(state, id, answer);
  if (error) return { ok: false, error };
  return {
    ok: true,
    state: { ...state, inbox: withItem(state, id, { status: "answered", answer: answer.trim() }) },
  };
}

/** Approve the answer: the question becomes a playbook entry, newest first. */
export function addToPlaybook(
  state: EscalationState,
  id: string,
  answer: string,
  today: string,
): FlowResult {
  const error = check(state, id, answer);
  if (error) return { ok: false, error };
  const item = state.inbox.find((i) => i.id === id) as InboxItem;
  const entry: PlaybookEntry = {
    id: `pb-${id}`,
    question: item.question,
    answer: answer.trim(),
    tags: ["from-inbox"],
    updated: today,
  };
  return {
    ok: true,
    state: {
      inbox: withItem(state, id, { status: "added", answer: entry.answer }),
      playbook: [entry, ...state.playbook],
    },
  };
}
