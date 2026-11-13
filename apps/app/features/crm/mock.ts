/** Development only (`/call?mock=1`): a canned Zoho lookup so the rail can be reviewed and
 * screenshotted without a Zoho account. Never used in a release build (CallView's mock flag). */
import type { Brief, Candidate, MeetingCandidate, MeetingDetail } from "./api";

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
      currency: "AED",
    },
  ],
  notes: [
    { date: "2026-11-04", title: "Pricing call", text: "Asked for volume pricing above 50 seats." },
    { date: "2026-10-20", title: "", text: "Prefers a quarterly invoice; CFO signs off." },
  ],
  text: "Contact: Jane Doe, CFO\nAccount: Acme Corp (Retail)\nOpen deal: Acme renewal 2027 — Negotiation, amount 12000, closes 2026-12-01",
};

const at = (minutes: number) => {
  const d = new Date(Date.now() + minutes * 60_000);
  d.setSeconds(0, 0);
  return d;
};
const MEETINGS: MeetingCandidate[] = [
  ["4150868000000300001", "Acme renewal call", 30, "Acme renewal 2027"],
  ["4150868000000300002", "Globex intro", 26 * 60, "Globex pilot"],
  ["4150868000000300003", "Initech pricing follow-up", 3 * 24 * 60, "Initech expansion"],
].map(([id, title, mins, deal]) => {
  const start = at(mins as number);
  return {
    id: id as string,
    title: title as string,
    start: start.toISOString(),
    end: new Date(start.getTime() + 30 * 60_000).toISOString(),
    agenda: "Go through volume pricing and the start date.",
    participants: ["Jane Doe", "Ada Admin"],
    related: { module: "Deals" as const, id: "4150868000000400001", name: deal as string },
    evidence: { field: "time" as const, value: start.toISOString() },
  };
});
const MEETING = MEETINGS[0] as MeetingCandidate;
const DETAIL: MeetingDetail = {
  id: MEETING.id,
  title: MEETING.title,
  start: MEETING.start,
  end: MEETING.end,
  participants: [
    { name: "Jane Doe", email: "jane@acme.test", type: "contact" },
    { name: "Ada Admin", email: "ada@agn.test", type: "user" },
  ],
  related: MEETING.related ?? null,
  contact: { id: JANE.id, name: JANE.name },
  description: "Go through volume pricing above 50 seats and agree the start date.",
  venue: "Zoho Meeting",
  link: "https://meeting.zoho.com/example",
};

export const mockMeetings = {
  meetings: async (_page?: number) => ({ meetings: MEETINGS, page: 1, more: false }),
  detail: async (id: string) => ({
    meeting: {
      ...DETAIL,
      ...(MEETINGS.find((m) => m.id === id) ?? {}),
      participants: DETAIL.participants,
    },
  }),
};

export const mockLookup = {
  meetings: mockMeetings,
  meetingBrief: async (_id: string) => ({
    brief: {
      ...BRIEF,
      meeting: { ...MEETING },
      text: `Meeting: ${MEETING.title}\nAttendees: Jane Doe, Ada Admin\n${BRIEF.text}`,
    },
  }),
  // "new…" stands for an unknown caller: no match, so the rail offers a Lead (UX-19).
  search: async (q: string) => ({ candidates: /^new/i.test(q.trim()) ? [] : [JANE, JOHN] }),
  brief: async (_c: Pick<Candidate, "module" | "id">) => ({ brief: BRIEF }),
};

/** Dev mock: every approved card "saves" after a short pause. */
export const mockPerform = async (_kind: string, _fields: Record<string, string>, _key: string) => {
  await new Promise((r) => setTimeout(r, 300));
  return { ok: true as const, id: "9900000000000000001" };
};
