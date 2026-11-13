/**
 * WhatsApp through Gallabox (D-033, D-039). Template-only: the server holds the keys, the org's
 * allow-list and each template's parameters; the agent fills them, previews and confirms.
 */
import { cloudApi } from "../../lib/cloud";

export type Param = {
  name: string;
  component: "header" | "body" | "button";
  type: string;
  example: string;
};
export type Template = {
  name: string;
  language: string;
  category: string;
  status: string;
  body: string;
  params: Param[];
};
export type GallaboxStatus = { configured: boolean; updated_at?: number; templates: Template[] };
export type GallaboxInput = {
  api_key: string;
  api_secret: string;
  account_id: string;
  channel_id: string;
};
export type Message = {
  template: string;
  language: string;
  recipient: { name: string; phone: string };
  values: Record<string, string>;
};
export type Preview = {
  template: string;
  language: string;
  to: { name: string; phone: string };
  text: string;
};

export const gallaboxStatus = () =>
  cloudApi<GallaboxStatus>(`/api/v1/company/gallabox?t=${Date.now()}`);
export const saveGallabox = (body: GallaboxInput) =>
  cloudApi<GallaboxStatus>("/api/v1/company/gallabox", { method: "PUT", body });
export const removeGallabox = () =>
  cloudApi<GallaboxStatus>("/api/v1/company/gallabox", { method: "DELETE" });
export const loadTemplates = () =>
  cloudApi<{ templates: Template[] }>("/api/v1/company/gallabox/templates/load", {
    method: "POST",
  });
export const saveAllowList = (selected: { name: string; language: string }[]) =>
  cloudApi<GallaboxStatus>("/api/v1/company/gallabox/templates", {
    method: "PUT",
    body: { selected },
  });
export const allowedTemplates = () =>
  cloudApi<{ templates: Template[]; freeform: false }>("/api/v1/whatsapp/templates");
export const previewWhatsApp = (m: Message) =>
  cloudApi<Preview>("/api/v1/whatsapp/preview", { method: "POST", body: m });
export const sendWhatsApp = (m: Message, idempotencyKey: string) =>
  cloudApi<{ status: "sent"; duplicate: boolean }>("/api/v1/whatsapp/send", {
    method: "POST",
    body: { ...m, type: "template", confirm: true, idempotency_key: idempotencyKey },
  });

/** Distinct parameter names: a header and a body may share one ({{name}}), filled once. */
export function fieldsOf(t: Template): Param[] {
  const seen = new Set<string>();
  return t.params.filter((p) => {
    if (seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
  });
}

/** Obvious prefills from the call: the customer's name for a name-like parameter. */
export function prefill(t: Template, customer: { name?: string }): Record<string, string> {
  const out: Record<string, string> = {};
  const first = (customer.name ?? "").trim().split(/\s+/)[0] ?? "";
  for (const p of fieldsOf(t)) {
    out[p.name] = /^(name|first_?name|customer_?name)$/i.test(p.name) && first ? first : "";
  }
  return out;
}

export const keyOf = (t: Pick<Template, "name" | "language">) => `${t.name}/${t.language}`;
