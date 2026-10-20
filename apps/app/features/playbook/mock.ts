/** Mock playbook entries (Phase 3). Fictional demo content, never the owner's real playbook. */
export type PlaybookEntry = {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  /** ISO date; empty for entries from the playbook file (no edit date). */
  updated: string;
  /** Where it lives on the Sotto server (D-020); absent for sample entries. Only "custom" and
   * "inbox" entries are editable; "file" entries come from the company's playbook documents. */
  source?: "file" | "inbox" | "custom";
};

export const PLAYBOOK: PlaybookEntry[] = [
  {
    id: "pb-1",
    question: "Is the two-bedroom at Palm Grove Marina still available?",
    answer: "Two units remain, on floors 12 and 18. Offer a viewing this week.",
    tags: ["availability", "marina"],
    updated: "2026-10-12",
  },
  {
    id: "pb-2",
    question: "Another agency quoted less for something similar.",
    answer: "Ask what their quote includes, then offer a line-by-line comparison.",
    tags: ["objection", "price"],
    updated: "2026-10-09",
  },
  {
    id: "pb-3",
    question: "What payment plans do you offer?",
    answer: "60/40: 60% during construction, 40% on handover. No interest.",
    tags: ["payment"],
    updated: "2026-10-02",
  },
  {
    id: "pb-4",
    question: "When is handover?",
    answer: "Q1 2027, written into the sales contract.",
    tags: ["handover"],
    updated: "2026-09-28",
  },
  {
    id: "pb-5",
    question: "Can foreigners buy freehold here?",
    answer: "Yes. The building is in a designated freehold area for all nationalities.",
    tags: ["ownership", "legal"],
    updated: "2026-09-20",
  },
  {
    id: "pb-6",
    question: "What is the expected rental yield?",
    answer:
      "Do not promise a yield. Share last year's average for the building and say it is not a guarantee.",
    tags: ["investment", "compliance"],
    updated: "2026-09-15",
  },
];

/** Case-insensitive match on question, answer and tags; every word of the query must match. */
export function searchPlaybook(entries: readonly PlaybookEntry[], query: string): PlaybookEntry[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...entries];
  return entries.filter((e) => {
    const hay = `${e.question} ${e.answer} ${e.tags.join(" ")}`.toLocaleLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
