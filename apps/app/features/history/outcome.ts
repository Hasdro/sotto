import type { BadgeTone } from "@sotto/ui";
import type { Outcome } from "./mock";

/** Badge tone per call outcome: booked reads as success, follow-up as caution. */
export const OUTCOME_TONE: Record<Outcome, BadgeTone> = {
  meeting: "answer",
  followUp: "objection",
  lost: "neutral",
  practice: "primary",
  live: "neutral",
};
