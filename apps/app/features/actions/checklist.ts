/**
 * The after-call checklist as data (UX-04, D-044): one item per suggested Zoho write, built from
 * the attached record, the review and the agent's note. Nothing here sends anything; the
 * component ticks, edits and saves. Kept pure so the rules (what is offered, what each write
 * carries, when a meeting may be ticked) are tested without rendering.
 */
import { type CallReview, chanceBand } from "@sotto/engine";
import { LRI, PDI } from "@sotto/ui";
import type { StringKey } from "../../lib/i18n";
import type { Brief } from "../crm/api";
import { isoWithOffset, localToIso } from "./ActionCard";
import type { ActionsT } from "./strings";

export type ItemId = "call_log" | "meeting" | "contact_update" | "lead" | "deal_note";
export type Field = { name: string; label: string; multiline?: boolean };
export type Item = {
  id: ItemId;
  /** The one-line summary next to the checkbox. */
  label: (values: Record<string, string>) => string;
  fields: Field[];
  initial: Record<string, string>;
  /** The request fields, or an error message. */
  build: (values: Record<string, string>) => Record<string, string> | string;
  /** False while the item may not be ticked (meeting: time not confirmed; log: no summary). */
  ready: (values: Record<string, string>) => boolean;
  blockedHint?: string;
  /** Zoho module and record the item writes to, for "Open in Zoho". */
  parent?: { module: string; id: string };
};

type T = (key: StringKey, vars?: Record<string, string | number>) => string;

const trimmed = (v: Record<string, string>, names: string[]) =>
  Object.fromEntries(names.map((n) => [n, (v[n] ?? "").trim()]).filter(([, x]) => x));

/** Zoho's own limits for the call-log note fields (cloud/zoho/actions.py). */
const SUMMARY_MAX = 800;
const LIST_MAX = 400;
const NEXT_MAX = 200;

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
  } catch {
    return "local time";
  }
}

/** The parent of the call log (D-047): Deal, else Contact, else Lead. */
export function callLogParent(brief: Brief | null): { field: string; module: string; id: string } | null {
  const deal = brief?.deals.find((d) => d.id);
  if (deal) return { field: "deal_id", module: "Deals", id: deal.id };
  const p = brief?.person;
  if (p?.module === "Contacts") return { field: "contact_id", module: "Contacts", id: p.id };
  if (p?.module === "Leads") return { field: "lead_id", module: "Leads", id: p.id };
  return null;
}

/**
 * The summary the server writes first in the note. The agent's note and (when chosen) the
 * risk reasons ride in it, because the server's call_log accepts only the review fields; never
 * transcript text, so a risk's quote stays in the review on this device (D-047).
 */
export function callLogSummary(
  summary: string,
  note: string,
  risks: readonly { reason: string }[] | null,
): string {
  const parts = [summary.trim()];
  if (note.trim()) parts.push(`Agent note: ${note.trim()}`);
  if (risks?.length)
    parts.push(`Risk signals (AI-estimated): ${risks.map((r) => r.reason).join("; ")}`);
  return parts.filter(Boolean).join("\n").slice(0, SUMMARY_MAX);
}

/** The exact note Zoho will hold, line by line, as the server writes it. */
export function callLogPreview(fields: Record<string, string>): string {
  const lines = [`Summary: ${fields.summary ?? ""}`];
  for (const [name, label] of [
    ["objections", "Objections"],
    ["commitments", "Commitments"],
    ["next_step", "Next step"],
    ["chance_band", "Chance"],
  ] as const) {
    if (fields[name]) lines.push(`${label}: ${fields[name]}`);
  }
  return lines.join("\n");
}

function callLogItem(
  at: ActionsT,
  callId: string,
  brief: Brief | null,
  review: CallReview | null,
  note: string,
): Item | null {
  const parent = callLogParent(brief);
  if (!parent) return null;
  const summary = review?.summary || "";
  return {
    id: "call_log",
    label: () => (review || note.trim() ? at("after.callLog") : at("after.callLog.waiting")),
    fields: [
      { name: "summary", label: at("after.callLog.summary"), multiline: true },
      { name: "note", label: at("after.callLog.note"), multiline: true },
      { name: "objections", label: at("after.callLog.objections") },
      { name: "commitments", label: at("after.callLog.commitments") },
      { name: "next_step", label: at("after.callLog.nextStep") },
    ],
    initial: {
      summary,
      note: note.trim(),
      objections: (review?.objections ?? []).join("; "),
      commitments: (review?.commitments ?? []).join("; "),
      next_step: review?.next_step?.text ?? "",
      risks: "",
    },
    build: (v) => {
      const risks = v.risks === "1" ? (review?.risks ?? []) : null;
      const out: Record<string, string> = {
        call_id: callId,
        [parent.field]: parent.id,
        summary: callLogSummary(v.summary ?? "", v.note ?? "", risks),
        objections: (v.objections ?? "").trim().slice(0, LIST_MAX),
        commitments: (v.commitments ?? "").trim().slice(0, LIST_MAX),
        next_step: (v.next_step ?? "").trim().slice(0, NEXT_MAX),
        ...(review ? { chance_band: chanceBand(review.success) } : {}),
      };
      return Object.fromEntries(Object.entries(out).filter(([, x]) => x));
    },
    ready: (v) => Boolean((v.summary ?? "").trim() || (v.note ?? "").trim()),
    parent: { module: parent.module, id: parent.id },
  };
}

function meetingItem(t: T, at: ActionsT, brief: Brief | null, review: CallReview | null): Item {
  const contactId = brief?.person?.module === "Contacts" ? brief.person.id : "";
  const dealId = brief?.deals.find((d) => d.id)?.id ?? "";
  const who = brief?.person?.name;
  const step = review?.next_step ?? null;
  const tz = deviceTimeZone();
  return {
    id: "meeting",
    label: (v) =>
      v.date && v.time
        ? at("after.meeting", { when: `${v.date} ${v.time}` })
        : at("after.meeting.unset"),
    fields: [
      { name: "title", label: t("actions.field.title") },
      { name: "date", label: at("after.meeting.date") },
      { name: "time", label: at("after.meeting.time") },
      { name: "minutes", label: t("actions.field.minutes") },
      { name: "description", label: t("actions.field.description"), multiline: true },
    ],
    initial: {
      title: step?.text ? step.text : who ? `Follow-up: ${who}` : "",
      date: step?.date ?? "",
      time: step?.time ?? "",
      minutes: "30",
      description: "",
      confirmed: "",
    },
    build: (v) => {
      const start = localToIso(`${v.date ?? ""} ${v.time ?? ""}`);
      const minutes = Number(v.minutes);
      if (!start || !Number.isFinite(minutes) || minutes <= 0 || minutes > 480)
        return t("actions.badTime");
      const end = new Date(new Date(start).getTime() + minutes * 60_000);
      return {
        ...trimmed(v, ["title", "description"]),
        start,
        end: isoWithOffset(end),
        ...(contactId ? { contact_id: contactId } : {}),
        ...(dealId ? { deal_id: dealId } : {}),
      };
    },
    // INT-02m: the agent confirms date, time and time zone before the row can be ticked.
    ready: (v) => v.confirmed === tz && localToIso(`${v.date ?? ""} ${v.time ?? ""}`) !== null,
    blockedHint: at("after.meeting.confirmFirst"),
  };
}

function contactItem(t: T, at: ActionsT, brief: Brief): Item | null {
  const p = brief.person;
  if (p?.module !== "Contacts") return null;
  return {
    id: "contact_update",
    label: () => at("after.contact", { name: `${LRI}${p.name}${PDI}` }),
    fields: [
      { name: "email", label: t("actions.field.email") },
      { name: "phone", label: t("actions.field.phone") },
      { name: "description", label: t("actions.field.description"), multiline: true },
    ],
    initial: { email: p.email, phone: p.phone, description: "" },
    build: (v) => {
      // Only what the agent changed is sent.
      const out: Record<string, string> = { contact_id: p.id };
      const email = (v.email ?? "").trim();
      const phone = (v.phone ?? "").trim();
      const description = (v.description ?? "").trim();
      if (email && email !== p.email) out.email = email;
      if (phone && phone !== p.phone) out.phone = phone;
      if (description) out.description = description;
      return out;
    },
    ready: (v) =>
      (v.email ?? "").trim() !== p.email ||
      (v.phone ?? "").trim() !== p.phone ||
      Boolean((v.description ?? "").trim()),
    parent: { module: "Contacts", id: p.id },
  };
}

function leadItem(t: T, at: ActionsT): Item {
  return {
    id: "lead",
    label: () => at("after.lead"),
    fields: [
      { name: "first_name", label: t("actions.field.first_name") },
      { name: "last_name", label: t("actions.field.last_name") },
      { name: "company", label: t("actions.field.company") },
      { name: "email", label: t("actions.field.email") },
      { name: "phone", label: t("actions.field.phone") },
    ],
    initial: {},
    build: (v) => trimmed(v, ["first_name", "last_name", "company", "email", "phone"]),
    ready: (v) => Boolean((v.last_name ?? "").trim() && (v.company ?? "").trim()),
  };
}

/** UX-41: "Note on <deal>", the deal name isolated left to right; no second "Deal:". */
export function dealNoteLabel(at: ActionsT, deal: string): string {
  return at("after.dealNote", { deal: `${LRI}${deal}${PDI}` });
}

function dealNoteItem(t: T, at: ActionsT, brief: Brief, notes: string): Item | null {
  const deal = brief.deals.find((d) => d.id);
  if (!deal || !notes.trim()) return null;
  return {
    id: "deal_note",
    label: () => dealNoteLabel(at, deal.name),
    fields: [
      { name: "title", label: t("actions.field.title") },
      { name: "content", label: t("actions.field.content"), multiline: true },
    ],
    initial: { title: "", content: notes },
    build: (v) => ({ deal_id: deal.id, ...trimmed(v, ["title", "content"]) }),
    ready: (v) => Boolean((v.content ?? "").trim()),
    parent: { module: "Deals", id: deal.id },
  };
}

/** The suggested updates, in order: call log, meeting, contact or lead, deal note. */
export function buildItems(opts: {
  t: T;
  at: ActionsT;
  callId: string;
  brief: Brief | null;
  review: CallReview | null;
  /** The agent's "Note for after the call". */
  note: string;
  /** Prep notes typed before the call (the Deal note). */
  prepNotes: string;
}): Item[] {
  const { t, at, callId, brief, review, note, prepNotes } = opts;
  const items: (Item | null)[] = [
    callLogItem(at, callId, brief, review, note),
    meetingItem(t, at, brief, review),
    brief?.person?.module === "Contacts"
      ? contactItem(t, at, brief)
      : brief?.person
        ? null
        : leadItem(t, at),
    brief ? dealNoteItem(t, at, brief, prepNotes) : null,
  ];
  return items.filter((i): i is Item => i !== null);
}

/** "https://www.zohoapis.eu" → "https://crm.zoho.eu/crm/tab/Deals/<id>"; null when unknown. */
export function zohoWebUrl(apiDomain: string | undefined, module: string, id: string): string | null {
  const m = /^https:\/\/(?:www\.)?zohoapis\.([a-z.]+)\/?$/.exec(apiDomain ?? "");
  if (!m || !/^\d{5,25}$/.test(id)) return null;
  return `https://crm.zoho.${m[1]}/crm/tab/${module}/${id}`;
}
