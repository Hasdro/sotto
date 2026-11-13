/**
 * The Zoho action cards built from what is attached to the call (R12): a follow-up Meeting, a
 * Lead, a Contact update and a Note on the open Deal. No Deal field other than its note exists.
 */
import type { ReactNode } from "react";
import type { StringKey } from "../../lib/i18n";
import type { Brief } from "../crm/api";
import { ActionCard, isoWithOffset, localText, localToIso, type Perform } from "./ActionCard";

type T = (key: StringKey, vars?: Record<string, string | number>) => string;
const trimmed = (v: Record<string, string>, names: string[]) =>
  Object.fromEntries(names.map((n) => [n, (v[n] ?? "").trim()]).filter(([, x]) => x));

export function meetingCard(t: T, brief: Brief | null, perform?: Perform): ReactNode {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  const contactId = brief?.person?.module === "Contacts" ? brief.person.id : "";
  const dealId = brief?.deals.find((d) => d.id)?.id ?? "";
  const who = brief?.person?.name;
  return (
    <ActionCard
      key="meeting"
      kind="meeting"
      title={t("actions.meeting")}
      perform={perform}
      specs={[
        { name: "title", label: "actions.field.title" },
        { name: "start", label: "actions.field.start" },
        { name: "minutes", label: "actions.field.minutes" },
        { name: "description", label: "actions.field.description", multiline: true },
      ]}
      initial={{
        title: who ? `Follow-up: ${who}` : "",
        start: localText(tomorrow),
        minutes: "30",
        description: "",
      }}
      build={(v) => {
        const start = localToIso(v.start ?? "");
        const minutes = Number(v.minutes);
        if (!start || !Number.isFinite(minutes) || minutes <= 0 || minutes > 480)
          return "actions.badTime";
        const end = new Date(new Date(start).getTime() + minutes * 60_000);
        return {
          ...trimmed(v, ["title", "description"]),
          start,
          end: isoWithOffset(end),
          ...(contactId ? { contact_id: contactId } : {}),
          ...(dealId ? { deal_id: dealId } : {}),
        };
      }}
    />
  );
}

export function leadCard(t: T, perform?: Perform): ReactNode {
  return (
    <ActionCard
      key="lead"
      kind="lead"
      title={t("actions.lead")}
      perform={perform}
      specs={[
        { name: "first_name", label: "actions.field.first_name" },
        { name: "last_name", label: "actions.field.last_name" },
        { name: "company", label: "actions.field.company" },
        { name: "email", label: "actions.field.email" },
        { name: "phone", label: "actions.field.phone" },
      ]}
      initial={{}}
      build={(v) => trimmed(v, ["first_name", "last_name", "company", "email", "phone"])}
    />
  );
}

export function contactCard(t: T, brief: Brief, perform?: Perform): ReactNode {
  const p = brief.person;
  if (p?.module !== "Contacts") return null;
  return (
    <ActionCard
      key="contact_update"
      kind="contact_update"
      title={t("actions.contact_update")}
      perform={perform}
      specs={[
        { name: "email", label: "actions.field.email" },
        { name: "phone", label: "actions.field.phone" },
        { name: "description", label: "actions.field.description", multiline: true },
      ]}
      initial={{ email: p.email, phone: p.phone, description: "" }}
      build={(v) => {
        // Only what the agent changed is sent.
        const out: Record<string, string> = { contact_id: p.id };
        const email = (v.email ?? "").trim();
        const phone = (v.phone ?? "").trim();
        const description = (v.description ?? "").trim();
        if (email && email !== p.email) out.email = email;
        if (phone && phone !== p.phone) out.phone = phone;
        if (description) out.description = description;
        return out;
      }}
    />
  );
}

export function dealNoteCard(t: T, brief: Brief, notes: string, perform?: Perform): ReactNode {
  const deal = brief.deals.find((d) => d.id);
  if (!deal) return null;
  return (
    <ActionCard
      key="deal_note"
      kind="deal_note"
      title={`${t("actions.deal_note")} · ${t("actions.field.deal", { name: deal.name })}`}
      perform={perform}
      specs={[
        { name: "title", label: "actions.field.title" },
        { name: "content", label: "actions.field.content", multiline: true },
      ]}
      initial={{ title: "", content: notes }}
      build={(v) => ({ deal_id: deal.id, ...trimmed(v, ["title", "content"]) })}
    />
  );
}
