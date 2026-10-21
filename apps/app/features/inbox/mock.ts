/** Mock unanswered-questions inbox (R2 step 4–5). Fictional demo content. */
export type InboxStatus = "open" | "answered" | "added";

export type InboxItem = {
  id: string;
  question: string;
  customer: string;
  agent: string;
  /** ISO date-time. */
  askedAt: string;
  status: InboxStatus;
  answer?: string;
  /** The conversation just before the question (R2 step 4, T-034). */
  excerpt?: string;
  /** "server": escalated on this Sotto server (D-020); answers go to its API. */
  source?: "sample" | "server";
};

export const INBOX: InboxItem[] = [
  {
    id: "q-31",
    question: "Can I pay the deposit in bitcoin?",
    customer: "James Whitfield",
    agent: "Sara Khalil",
    askedAt: "2026-10-18T11:21:00+04:00",
    status: "open",
  },
  {
    id: "q-30",
    question: "Does the service charge cover district cooling?",
    customer: "Layla Haddad",
    agent: "Sara Khalil",
    askedAt: "2026-10-18T10:15:00+04:00",
    status: "open",
  },
  {
    id: "q-29",
    question: "Is there a discount for buying two units?",
    customer: "Priya Nair",
    agent: "Yousef Darwish",
    askedAt: "2026-10-17T16:48:00+04:00",
    status: "answered",
    answer: "Yes: 2% off the second unit when both are booked the same week.",
  },
  {
    id: "q-28",
    question: "Are pets allowed in the Marina tower?",
    customer: "Omar Al Mansouri",
    agent: "Sara Khalil",
    askedAt: "2026-10-16T13:02:00+04:00",
    status: "added",
    answer: "Cats and small dogs are allowed; registration with the building manager is required.",
  },
];

export function byStatus(items: readonly InboxItem[], status: InboxStatus): InboxItem[] {
  return items.filter((i) => i.status === status);
}

export function countByStatus(items: readonly InboxItem[]): Record<InboxStatus, number> {
  return {
    open: byStatus(items, "open").length,
    answered: byStatus(items, "answered").length,
    added: byStatus(items, "added").length,
  };
}
