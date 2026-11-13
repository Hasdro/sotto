/** Mock call history (Phase 3, no real data). Fictional customers of the demo company. */
import type { CardSource, CardType } from "@sotto/shared";
import type { CallSource } from "../../lib/callSource";

/** "practice": a call with sample answers (no AI key), not a real customer; "live": a real call
 * whose result Sotto does not know (the agent records it in the CRM). */
export type Outcome = "meeting" | "followUp" | "lost" | "practice" | "live";

export type PastCard = {
  type: CardType;
  source: CardSource;
  text: string;
  atMs: number;
  /** The live card's id when the call saved it (ratings in History match the live ones). */
  id?: string;
};
export type PastLine = { speaker: "customer" | "agent"; text: string; atMs: number };

export type PastCall = {
  id: string;
  customer: string;
  company: string;
  /** ISO date-time. */
  startedAt: string;
  minutes: number;
  outcome: Outcome;
  transcript: PastLine[];
  cards: PastCard[];
  /** Where the call came from (owner, 22 Oct); unknown for older calls. */
  source?: CallSource;
  /** Cards shown, when the list has no card details. */
  cardCount?: number;
  /** What the agent typed during the call. */
  notes?: string;
  /** The review's chance to close, 0–100, when there is a review. */
  success?: number;
};

export const PAST_CALLS: PastCall[] = [
  {
    id: "c-1042",
    customer: "Layla Haddad",
    company: "Haddad Family Office",
    startedAt: "2026-10-18T10:12:00+04:00",
    minutes: 7,
    outcome: "meeting",
    transcript: [
      {
        speaker: "customer",
        text: "We're looking at three-bedroom units with a sea view.",
        atMs: 4000,
      },
      {
        speaker: "agent",
        text: "We have two on the Marina side. What's your timeline?",
        atMs: 9000,
      },
      { speaker: "customer", text: "Within two months. Is the handover date fixed?", atMs: 15000 },
      {
        speaker: "agent",
        text: "Handover is Q1 next year, in writing in the contract.",
        atMs: 21000,
      },
      { speaker: "customer", text: "And the payment plan?", atMs: 30000 },
    ],
    cards: [
      {
        type: "question",
        source: "playbook",
        text: "Ask about budget range and whether they need financing.",
        atMs: 5000,
      },
      {
        type: "answer",
        source: "playbook",
        text: "Handover is Q1 2027 and it is written into the sales contract.",
        atMs: 16000,
      },
      {
        type: "answer",
        source: "playbook",
        text: "Offer the 60/40 plan: 60% during construction, 40% on handover.",
        atMs: 31000,
      },
    ],
  },
  {
    id: "c-1041",
    customer: "Omar Al Mansouri",
    company: "Private buyer",
    startedAt: "2026-10-18T09:05:00+04:00",
    minutes: 4,
    outcome: "followUp",
    transcript: [
      { speaker: "customer", text: "Another agency quoted us twenty percent less.", atMs: 6000 },
      { speaker: "agent", text: "What does their price include?", atMs: 12000 },
    ],
    cards: [
      {
        type: "objection",
        source: "playbook",
        text: "Ask what their quote includes, then offer a line-by-line comparison.",
        atMs: 7000,
      },
    ],
  },
  {
    id: "c-1040",
    customer: "Priya Nair",
    company: "Nair Holdings",
    startedAt: "2026-10-17T16:40:00+04:00",
    minutes: 11,
    outcome: "meeting",
    transcript: [
      { speaker: "customer", text: "Can foreigners own freehold in this building?", atMs: 5000 },
      { speaker: "agent", text: "Yes, it is in a freehold zone.", atMs: 10000 },
    ],
    cards: [
      {
        type: "answer",
        source: "playbook",
        text: "Yes. The building is in a designated freehold area for all nationalities.",
        atMs: 6000,
      },
      {
        type: "warning",
        source: "playbook",
        text: "Do not promise visa eligibility. Refer them to the official criteria.",
        atMs: 11000,
      },
    ],
  },
  {
    id: "c-1039",
    customer: "James Whitfield",
    company: "Whitfield Relocation",
    startedAt: "2026-10-17T11:20:00+04:00",
    minutes: 3,
    outcome: "lost",
    transcript: [{ speaker: "customer", text: "Can I pay the deposit in bitcoin?", atMs: 8000 }],
    cards: [
      {
        type: "holding",
        source: "holding",
        text: "Good question. Let me confirm that and send it to you today.",
        atMs: 9400,
      },
    ],
  },
];

export function findCall(id: string): PastCall | undefined {
  return PAST_CALLS.find((c) => c.id === id);
}
