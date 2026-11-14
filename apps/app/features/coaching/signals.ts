/**
 * After a call (INT-05, INT-15): the few signals the coaching view and playbook suggestions need,
 * built on the device (D-022). The objection themes of the call (price, timing…, no words), and
 * for each AI card the agent marked "not helpful", the customer's question just before it (one
 * line, like an escalation). Nothing else from the call leaves the device.
 */
import type { DeviceEntry } from "../../lib/deviceHistory";
import type { RatedCard } from "../rating/ratings";
import { type Theme, themeOf } from "../reports/objections";

const QUESTION_CHARS = 300;
const MAX_QUESTIONS = 20;

export type CallSignals = {
  call_id: string;
  objections: Theme[];
  not_helpful: { question: string }[];
};

const clip = (text: string) => {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > QUESTION_CHARS ? one.slice(0, QUESTION_CHARS) : one;
};

export function buildSignals(
  callId: string,
  transcript: readonly DeviceEntry[],
  ratings: readonly RatedCard[],
): CallSignals | null {
  const themes = new Set<Theme>();
  const before = new Map<string, string>(); // card text → the customer's line before it
  let said = "";
  for (const e of transcript) {
    if (e.kind === "line" && e.speaker === "customer") said = e.text;
    if (e.kind !== "card") continue;
    if (e.type === "objection" && said) themes.add(themeOf(said));
    if (said && !before.has(e.text.trim())) before.set(e.text.trim(), said);
  }
  const questions: string[] = [];
  for (const r of ratings) {
    if (r.rating !== "down") continue;
    const q = before.get(r.text.trim());
    if (q && !questions.includes(clip(q))) questions.push(clip(q));
  }
  if (themes.size === 0 && questions.length === 0) return null;
  return {
    call_id: callId,
    objections: [...themes],
    not_helpful: questions.slice(0, MAX_QUESTIONS).map((question) => ({ question })),
  };
}
