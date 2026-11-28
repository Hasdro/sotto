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

/**
 * `auto`: brief fields filled from the linked Zoho record, with the value filled in (UX-006).
 * `call`: the call the record and brief belong to; null while they wait for the next call
 * (picked on Home, or added before the call starts). SAFE-001.
 */
type State = { crm: Attached; prep: Prep; auto: Partial<Prep>; call: string | null };
const NONE: State = { crm: { kind: "none" }, prep: EMPTY_PREP, auto: {}, call: null };
let state: State = NONE;
/**
 * The call bound last. The call screen binds its call id again every time it opens, and the
 * session keeps an ended call's id until the next call starts, so binding that same id again
 * must change nothing: a meeting picked on Home after the call stays with the next call.
 */
let lastBound: string | null = null;
let gamePlanText = "";
const listeners = new Set<() => void>();

function set(next: Partial<State>): void {
  state = { ...state, ...next };
  for (const fn of listeners) fn();
}

/**
 * What a linked record fills in before the agent types (UX-006): the meeting title as the
 * objective, its agenda and the open deal as the TLDR, the people as attendees. Zoho's own
 * data only, no added words, so it reads the same in English and Arabic. Pure.
 */
export function prefillFrom(brief: Brief): Partial<Prep> {
  const m = brief.meeting;
  const deal = brief.deals.find((d) => d.name.trim());
  const dealLine = deal ? [deal.name, deal.stage].map((x) => x.trim()).filter(Boolean) : [];
  const fill: Partial<Prep> = {
    objective: m?.title.trim() ?? "",
    tldr: [m?.agenda.trim() ?? "", dealLine.join(" · ")].filter(Boolean).join("\n"),
    attendees: m?.participants.length ? m.participants.join(", ") : (brief.person?.name ?? ""),
  };
  return Object.fromEntries(
    Object.entries(fill)
      .map(([f, v]) => [f, (v ?? "").slice(0, PREP_MAX)])
      .filter(([, v]) => v),
  ) as Partial<Prep>;
}

/** True while a brief field still holds what Zoho filled in (the agent has not changed it). */
export function isPrefilled(s: State, field: PrepField): boolean {
  const auto = s.auto[field];
  return auto !== undefined && s.prep[field] === auto;
}

/**
 * The brief as the agent wrote it: a field still holding Zoho's prefill counts as empty. That
 * data already travels as the Zoho record, so the AI, the coach and the after-call note never
 * get it twice, and Zoho never gets its own data written back as a note (UX-006).
 */
export function agentPrep(s: State): Prep {
  const out = { ...s.prep };
  for (const f of PREP_FIELDS) if (isPrefilled(s, f)) out[f] = "";
  return out;
}

export function attachBrief(brief: Brief): void {
  // Empty fields start from the record; a field the agent already wrote is never replaced.
  const prep = { ...state.prep };
  const auto: Partial<Prep> = {};
  for (const [f, v] of Object.entries(prefillFrom(brief)) as [PrepField, string][]) {
    if (prep[f].trim()) continue;
    prep[f] = v;
    auto[f] = v;
  }
  set({ crm: { kind: "attached", brief }, prep, auto });
}
export const skipCrm = () => set({ crm: { kind: "skipped" } });
/** "Change": unlinks the record and empties the fields it filled that the agent left as they
 * were, so the next record never inherits the last one's attendees (UX-006). */
export const clearCrm = () => {
  const prep = { ...state.prep };
  for (const f of PREP_FIELDS) if (isPrefilled(state, f)) prep[f] = "";
  set({ crm: { kind: "none" }, prep, auto: {} });
};
/** Nothing attached, an empty brief, no game plan. */
function clearState(): void {
  gamePlanText = "";
  set(NONE);
}

/** A new call: nothing attached, an empty brief, and no call bound yet. */
export const resetCall = () => {
  lastBound = null;
  clearState();
};

export function setGamePlanText(text: string | null | undefined): void {
  gamePlanText = (text ?? "").trim().slice(0, GAME_PLAN_MAX);
}

export function attachedGamePlanText(): string {
  return gamePlanText;
}

/** Picked on the home screen: becomes the next call's brief. */
export function attachForNextCall(brief: Brief): void {
  clearState();
  attachBrief(brief);
}

/**
 * Called with the call screen's call id. A new call keeps what was prepared for it (a meeting
 * picked on Home, or what was added before it started); a record or brief that belongs to
 * another call is dropped, so it never carries into this one (SAFE-001).
 */
export function bindCall(callId: string | null): void {
  if (callId === null || callId === lastBound) return;
  if (state.call !== null) clearState();
  lastBound = callId;
  set({ call: callId });
}
export function setPrep(field: PrepField, value: string): void {
  set({ prep: { ...state.prep, [field]: value.slice(0, PREP_MAX) } });
}

export function attachedBriefText(): string {
  const parts: string[] = [];
  if (state.crm.kind === "attached") parts.push(state.crm.brief.text);
  const prep = agentPrep(state); // an untouched prefill is already in the Zoho text above
  for (const f of PREP_FIELDS) {
    const v = prep[f].trim().replace(/\s+/g, " ");
    if (v) parts.push(`${PREP_LABEL[f]}: ${v}`);
  }
  return parts.join("\n").slice(0, TEXT_MAX);
}

/** UX-009: the name the call is saved under: the linked person, else the meeting or the deal,
 * with the person's company. Null when nothing is linked (History names the call itself). */
export function attachedCallName(): { title: string; company: string } | null {
  if (state.crm.kind !== "attached") return null;
  const b = state.crm.brief;
  const title = (b.person?.name || b.meeting?.title || b.deals[0]?.name || "").trim();
  return title ? { title, company: (b.account?.name ?? "").trim() } : null;
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

/**
 * One call's record and brief (SAFE-001). History, the follow-up, the plan and the Zoho rows of
 * a call never take the record of a later call or of a meeting prepared for the next one:
 * another call's state reads as nothing attached.
 */
export function useAttachedStateFor(callId: string | null): State {
  const s = useAttachedState();
  return callId !== null && s.call === callId ? s : NONE;
}

export function useAttachedFor(callId: string | null): Attached {
  return useAttachedStateFor(callId).crm;
}
