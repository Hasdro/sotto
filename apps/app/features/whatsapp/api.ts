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
  /** ZC-07: where the app fills it from ("" = the agent types it). */
  source?: string;
};
export type Template = {
  name: string;
  language: string;
  category: string;
  status: string;
  body: string;
  params: Param[];
};
export type GallaboxStatus = {
  configured: boolean;
  updated_at?: number;
  /** ZC-07: whether a WhatsApp number is chosen, and its display name (never its id). */
  channel?: { set: boolean; label: string };
  templates: Template[];
};
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
export const allowedTemplates = () =>
  cloudApi<{ templates: Template[]; freeform: false }>("/api/v1/whatsapp/templates");
export const previewWhatsApp = (m: Message) =>
  cloudApi<Preview>("/api/v1/whatsapp/preview", { method: "POST", body: m });
export const sendWhatsApp = (m: Message, idempotencyKey: string) =>
  cloudApi<{ status: "sent"; duplicate: boolean }>("/api/v1/whatsapp/send", {
    method: "POST",
    body: { ...m, type: "template", confirm: true, idempotency_key: idempotencyKey },
  });

/** INT-10: the org's Gallabox status webhook (admin). The secret is returned once, on create. */
export type WebhookStatus = {
  configured: boolean;
  url: string | null;
  events: string[];
  state: { state: string; cause?: string };
};

/** Distinct parameter names: a header and a body may share one ({{name}}), filled once. */
export function fieldsOf(t: Template): Param[] {
  const seen = new Set<string>();
  return t.params.filter((p) => {
    if (seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
  });
}

export type PrefillContext = {
  name?: string;
  phone?: string;
  agent?: string;
  company?: string;
};

const firstOf = (v?: string) => (v ?? "").trim().split(/\s+/)[0] ?? "";
const NAME_LIKE = /^(name|first_?name|customer_?name)$/i;

/** UX-011: whether the customer-name field fills this parameter ({{name}}), and how. */
export function nameSource(p: Param): "customer.first_name" | "customer.name" | null {
  const source = p.source ?? (NAME_LIKE.test(p.name) ? "customer.first_name" : "");
  return source === "customer.first_name" || source === "customer.name" ? source : null;
}

/** The value a name-filled parameter takes from the customer's name. */
export function nameValue(p: Param, name: string): string {
  return nameSource(p) === "customer.name" ? name.trim() : firstOf(name);
}

/** UX-011: the template as the customer will read it; a parameter not filled yet stays {{x}}. */
export function fillBody(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (raw, key: string) => values[key]?.trim() || raw);
}

/** Prefills from the call: each parameter's mapped source (ZC-07), else a name-like guess. */
export function prefill(t: Template, ctx: PrefillContext): Record<string, string> {
  const out: Record<string, string> = {};
  const known: Record<string, string> = {
    "customer.first_name": firstOf(ctx.name),
    "customer.name": (ctx.name ?? "").trim(),
    "customer.phone": (ctx.phone ?? "").trim(),
    "agent.name": (ctx.agent ?? "").trim(),
    "agent.first_name": firstOf(ctx.agent),
    "company.name": (ctx.company ?? "").trim(),
  };
  for (const p of fieldsOf(t)) {
    const source = p.source ?? (NAME_LIKE.test(p.name) ? "customer.first_name" : "");
    out[p.name] = known[source] ?? "";
  }
  return out;
}

export const keyOf = (t: Pick<Template, "name" | "language">) => `${t.name}/${t.language}`;
