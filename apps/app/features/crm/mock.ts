/** Development only (`/call?mock=1`): a canned Zoho lookup so the rail can be reviewed and
 * screenshotted without a Zoho account. Never used in a release build (CallView's mock flag). */
import type { Brief, Candidate, MeetingCandidate } from "./api";

const JANE: Candidate = {
  module: "Contacts",
  id: "4150868000000224005",
  name: "Jane Doe",
  title: "CFO",
  company: "Acme Corp",
  email: "jane@acme.test",
  phone: "+1 (555) 010-2030",
  evidence: { field: "phone", value: "+1 (555) 010-2030" },
};
const JOHN: Candidate = {
  module: "Leads",
  id: "4150868000000224777",
  name: "John Doe",
  title: "Buyer",
  company: "Doe Trading",
  email: "john@doe.test",
  phone: "+1 (555) 010-9999",
  evidence: { field: "name", value: "John Doe" },
};
const BRIEF: Brief = {
  person: {
    module: "Contacts",
    id: JANE.id,
    name: JANE.name,
    title: JANE.title,
    email: JANE.email,
    phone: JANE.phone,
  },
  account: { name: "Acme Corp", industry: "Retail" },
  deals: [
    {
      id: "4150868000000400001",
      name: "Acme renewal 2027",
      stage: "Negotiation",
      amount: "12000",
      close_date: "2026-12-01",
      owner: "Ada Admin",
    },
  ],
  notes: [
    { date: "2026-11-04", title: "Pricing call", text: "Asked for volume pricing above 50 seats." },
    { date: "2026-10-20", title: "", text: "Prefers a quarterly invoice; CFO signs off." },
  ],
  text: "Contact: Jane Doe, CFO\nAccount: Acme Corp (Retail)\nOpen deal: Acme renewal 2027 — Negotiation, amount 12000, closes 2026-12-01",
};

const soon = new Date(Date.now() + 30 * 60_000);
soon.setSeconds(0, 0);
const MEETING: MeetingCandidate = {
  id: "4150868000000300001",
  title: "Acme renewal call",
  start: soon.toISOString(),
  end: new Date(soon.getTime() + 30 * 60_000).toISOString(),
  agenda: "Go through volume pricing and the start date.",
  participants: ["Jane Doe", "Ada Admin"],
  contact: { id: JANE.id, name: JANE.name },
  evidence: { field: "time", value: soon.toISOString() },
};

export const mockLookup = {
  meetings: async () => ({ candidates: [MEETING] }),
  meetingBrief: async (_id: string) => ({
    brief: {
      ...BRIEF,
      meeting: { ...MEETING },
      text: `Meeting: ${MEETING.title}\nAttendees: Jane Doe, Ada Admin\n${BRIEF.text}`,
    },
  }),
  search: async (_q: string) => ({ candidates: [JANE, JOHN] }),
  brief: async (_c: Pick<Candidate, "module" | "id">) => ({ brief: BRIEF }),
};

/** Dev mock: every approved card "saves" after a short pause. */
export const mockPerform = async (_kind: string, _fields: Record<string, string>, _key: string) => {
  await new Promise((r) => setTimeout(r, 300));
  return { ok: true as const, id: "9900000000000000001" };
};
