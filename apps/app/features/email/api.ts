/**
 * Org email through the management server (D-032, D-039). The app never sees an SMTP login:
 * the admin writes it once, and the agent's email is rendered and sent by the server after the
 * agent confirms the exact preview.
 */
import { cloudApi } from "../../lib/cloud";

export type SmtpAccount =
  | { configured: false }
  | {
      configured: true;
      host: string;
      port: 465 | 587;
      from_name: string;
      from_address: string;
      updated_at: number;
    };
export type SmtpStatus = {
  platform: SmtpAccount;
  org: SmtpAccount;
  active: "org" | "platform" | null;
};
export type SmtpInput = {
  host: string;
  port: number;
  username: string;
  /** Empty keeps the saved password. */
  password: string;
  from_name: string;
  from_address: string;
};
export type TestResult = { ok: true; to: string } | { ok: false; to: string; error: string };
export type Sender = { id: "org" | "platform"; from_name: string; from_address: string };
export type EmailFormat = {
  id: string;
  name: string;
  kind: "follow_up" | "meeting_confirmation" | "custom";
  subject: string;
  opening: string;
  body: string;
  signature: string;
};
export type Draft = {
  sender: string;
  format: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  customer_name: string;
  /** INT-14b: ids from the admin's attachment list. */
  attachments?: string[];
};
export type Attachment = { id: string; name: string; mime: string; size: number };
export type Preview = {
  from: { name: string; address: string };
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  attachments?: { name: string; size: number }[];
};
export type SendResult = { status: "sent"; duplicate: boolean };

export const smtpStatus = () => cloudApi<SmtpStatus>(`/api/v1/company/smtp?t=${Date.now()}`);
export const saveSmtp = (body: SmtpInput) =>
  cloudApi<SmtpStatus>("/api/v1/company/smtp", { method: "PUT", body });
export const removeSmtp = () => cloudApi<SmtpStatus>("/api/v1/company/smtp", { method: "DELETE" });
export const testSmtp = () => cloudApi<TestResult>("/api/v1/company/smtp/test", { method: "POST" });
export const emailFormats = () => cloudApi<{ formats: EmailFormat[] }>("/api/v1/email/formats");
export const saveFormats = (formats: EmailFormat[]) =>
  cloudApi<{ formats: EmailFormat[] }>("/api/v1/company/email/formats", {
    method: "PUT",
    body: { formats },
  });
export const emailSenders = () => cloudApi<{ senders: Sender[] }>("/api/v1/email/senders");
export const previewEmail = (draft: Draft) =>
  cloudApi<Preview>("/api/v1/email/preview", { method: "POST", body: draft });
export const sendEmail = (draft: Draft, idempotencyKey: string) =>
  cloudApi<SendResult>("/api/v1/email/send", {
    method: "POST",
    body: { ...draft, confirm: true, idempotency_key: idempotencyKey },
  });

/** INT-14b: the files the admin curated; agents pick, never upload. */
export const emailAttachments = () =>
  cloudApi<{ attachments: Attachment[] }>("/api/v1/email/attachments");

/** Splits "a@x.com, b@y.com; c@z.com" into addresses; the server validates each one. */
export function addressList(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((a) => a.trim())
    .filter(Boolean);
}

/** One key per confirmed message: a retry of the same send reuses it, so it is sent once. */
export function newIdempotencyKey(prefix: string): string {
  const random =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`.replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 100);
}
