/**
 * The minimised learning packet (D-034): the call summary, the prep brief, and each rated card
 * with the customer's turn just before and just after it, its rating and reasons. Never the
 * whole transcript and never the agent's own words: everything else from the call stays out.
 */
import type { DeviceEntry } from "../../lib/deviceHistory";
import type { RatedCard } from "../rating/ratings";

export const MIN_RATINGS = 3;
export const MAX_ITEMS = 8;
const TURN_CHARS = 300;
const CARD_CHARS = 400;
const SUMMARY_CHARS = 600;
const BRIEF_CHARS = 800;

const clip = (text: string, max: number) => {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
};

type Line = Extract<DeviceEntry, { kind: "line" }>;

function customerNear(entries: readonly DeviceEntry[], at: number, step: 1 | -1): string {
  for (let i = at + step; i >= 0 && i < entries.length; i += step) {
    const e = entries[i];
    if (e?.kind === "line" && e.speaker === "customer") return clip((e as Line).text, TURN_CHARS);
  }
  return "";
}

export function buildPacket(input: {
  summary: string;
  brief: string;
  transcript: readonly DeviceEntry[];
  ratings: readonly RatedCard[];
}): string {
  const used = new Set<number>();
  const cards = input.ratings.map((r, n) => {
    // The card's place in the call: the first unused card entry with the same text.
    const at = input.transcript.findIndex(
      (e, i) => !used.has(i) && e.kind === "card" && e.text.trim() === r.text.trim(),
    );
    if (at >= 0) used.add(at);
    const before = at >= 0 ? customerNear(input.transcript, at, -1) : "";
    const after = at >= 0 ? customerNear(input.transcript, at, 1) : "";
    const reasons = r.reasons.length ? ` (${r.reasons.join(", ").replace(/_/g, " ")})` : "";
    return [
      `${n + 1}. ${r.type} card: "${clip(r.text, CARD_CHARS)}"`,
      `   rating: ${r.rating === "up" ? "helpful" : "not helpful"}${reasons}`,
      `   customer before: "${before || "-"}"`,
      `   customer after: "${after || "-"}"`,
    ].join("\n");
  });
  return [
    `Summary: ${clip(input.summary, SUMMARY_CHARS) || "-"}`,
    `Prep brief: ${clip(input.brief, BRIEF_CHARS) || "-"}`,
    "Rated cards:",
    ...cards,
  ].join("\n");
}
