/**
 * What the agent attached to the current call (R10): the Zoho record they picked (never chosen
 * by the app) and the structured brief they wrote or edited (T-056). The live engine reads
 * `attachedBriefText()` on every customer sentence (packages/engine crmBrief → `crm_brief`
 * prompt); at the end of the call the brief is saved with it on the server.
 */
import { useSyncExternalStore } from "react";
import { type Brief, saveCallBrief } from "./api";

export type Attached = { kind: "none" } | { kind: "skipped" } | { kind: "attached"; brief: Brief };

export const PREP_FIELDS = [
  "tldr",
  "objective",
  "attendees",
  "pains",
  "competitors",
  "next_step",
] as const;
export type PrepField = (typeof PREP_FIELDS)[number];
export type Prep = Record<PrepField, string>;
const EMPTY_PREP: Prep = {
  tldr: "",
  objective: "",
  attendees: "",
  pains: "",
  competitors: "",
  next_step: "",
};
/** The labels the live prompt sees (data headings, not instructions). */
const PREP_LABEL: Record<PrepField, string> = {
  tldr: "TLDR",
  objective: "Call objective",
  attendees: "Attendees",
  pains: "Pains",
  competitors: "Competitors",
  next_step: "Next step",
};
const PREP_MAX = 400;
const TEXT_MAX = 2000;
const GAME_PLAN_MAX = 1600;

type State = { crm: Attached; prep: Prep };
let state: State = { crm: { kind: "none" }, prep: EMPTY_PREP };
let gamePlanText = "";
const listeners = new Set<() => void>();

function set(next: Partial<State>): void {
  state = { ...state, ...next };
  for (const fn of listeners) fn();
}

export function attachBrief(brief: Brief): void {
  // Attendees start from the meeting or the contact; the agent can edit them.
  const attendees =
    state.prep.attendees ||
    (brief.meeting?.participants.length
      ? brief.meeting.participants.join(", ")
      : (brief.person?.name ?? ""));
  set({ crm: { kind: "attached", brief }, prep: { ...state.prep, attendees } });
}
export const skipCrm = () => set({ crm: { kind: "skipped" } });
export const clearCrm = () => set({ crm: { kind: "none" } });
/** A new call: nothing attached, an empty brief. */
export const resetCall = () => {
  carry = false;
  gamePlanText = "";
  set({ crm: { kind: "none" }, prep: EMPTY_PREP });
};

export function setGamePlanText(text: string | null | undefined): void {
  gamePlanText = (text ?? "").trim().slice(0, GAME_PLAN_MAX);
}

export function attachedGamePlanText(): string {
  return gamePlanText;
}

// Which call the state belongs to. A meeting picked before the call (home screen) is carried
// into the next call; otherwise a new call id starts clean.
let boundCall: string | null = null;
let carry = false;

/** Picked on the home screen: becomes the next call's brief. */
export function attachForNextCall(brief: Brief): void {
  resetCall();
  attachBrief(brief);
  carry = true;
}

/** Called with the call screen's call id; a different id starts a clean brief. */
export function bindCall(callId: string | null): void {
  if (!callId || callId === boundCall) return;
  if (boundCall !== null && !carry) resetCall();
  carry = false;
  boundCall = callId;
}
export function setPrep(field: PrepField, value: string): void {
  set({ prep: { ...state.prep, [field]: value.slice(0, PREP_MAX) } });
}

export function attachedBriefText(): string {
  const parts: string[] = [];
  if (state.crm.kind === "attached") parts.push(state.crm.brief.text);
  for (const f of PREP_FIELDS) {
    const v = state.prep[f].trim().replace(/\s+/g, " ");
    if (v) parts.push(`${PREP_LABEL[f]}: ${v}`);
  }
  return parts.join("\n").slice(0, TEXT_MAX);
}

/** Saves the brief with the call (server, company-scoped). Nothing to save: nothing sent. */
export function saveBriefFor(callId: string): Promise<void> {
  const crm = state.crm.kind === "attached" ? state.crm.brief : null;
  const prep = Object.fromEntries(
    PREP_FIELDS.filter((f) => state.prep[f].trim()).map((f) => [f, state.prep[f].trim()]),
  );
  if (!crm && Object.keys(prep).length === 0) return Promise.resolve();
  return saveCallBrief(callId, {
    ...prep,
    ...(crm
      ? {
          crm: {
            text: crm.text,
            meeting_id: crm.meeting?.id ?? null,
            // INT-12: the Zoho Deal id for the weekly export (ids only, no text).
            deal_id: crm.deals.find((d) => d.id)?.id ?? null,
            person: crm.person ? { module: crm.person.module, id: crm.person.id } : null,
          },
        }
      : {}),
  }).then(
    () => {},
    () => {},
  );
}

export function useAttachedState(): State {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
    () => state,
  );
}

export function useAttached(): Attached {
  return useAttachedState().crm;
}
