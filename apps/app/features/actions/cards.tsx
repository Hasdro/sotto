/**
 * The during-call Zoho cards (R12): a Lead and a Contact update. After the call the checklist
 * (`checklist.ts`) offers the call log, meeting, contact and deal note instead.
 */
import type { ReactNode } from "react";
import type { StringKey } from "../../lib/i18n";
import type { Brief } from "../crm/api";
import { ActionCard, type Perform } from "./ActionCard";

type T = (key: StringKey, vars?: Record<string, string | number>) => string;
const trimmed = (v: Record<string, string>, names: string[]) =>
  Object.fromEntries(names.map((n) => [n, (v[n] ?? "").trim()]).filter(([, x]) => x));

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
