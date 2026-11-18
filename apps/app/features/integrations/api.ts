/**
 * Wave-3 integration calls (D-058: new client calls live here, not in lib/cloud.ts): SMTP
 * presets (UX-32), Gallabox pick lists (ZC-07) and inviting the team from Zoho (ZC-13).
 */

import { cloudApi } from "../../lib/cloud";
import type { GallaboxStatus, Template } from "../whatsapp/api";

export type PresetId = "google" | "microsoft" | "hostinger" | "zoho" | "other";
export type SmtpPreset = {
  domain: string;
  found_by: "known" | "mx" | "none";
  preset: { id: PresetId; label: string; host: string; port: 465 | 587 };
  /** The mailbox login for a known provider (the email address); "" for Other. */
  username: string;
  from_address: string;
  from_name: string;
};

export type GallaboxChannel = { ref: string; label: string; selected: boolean };
export type Discovered = {
  channels: GallaboxChannel[];
  /** APPROVED templates only, each parameter with its guessed `source`. */
  templates: Template[];
  /** "name/language" → parameters with no guessed source. */
  unmapped: Record<string, string[]>;
  /** Templates left out because WhatsApp has not approved them. */
  hidden: number;
  status: GallaboxStatus;
};

/** Where a template parameter's value comes from (server: adapters/whatsapp SOURCES). */
export const SOURCES = [
  "customer.first_name",
  "customer.name",
  "customer.phone",
  "agent.name",
  "agent.first_name",
  "company.name",
  "meeting.date",
  "meeting.time",
  "meeting.place",
  "deal.name",
] as const;
export type Source = (typeof SOURCES)[number];

export type ZohoPerson = {
  zoho_id: string;
  email: string;
  name: string;
  zoho_role: string;
  member: boolean;
  role: "agent" | "manager";
};
export type ZohoTeam = { people: ZohoPerson[]; fallback: boolean; seats_left: number };
export type Invited = {
  invited: { id: string; email: string; name: string; role: string; temporary_password: string }[];
  skipped: { email: string; reason: string }[];
};
export const zohoTeam = () => cloudApi<ZohoTeam>(`/api/v1/zoho/team?t=${Date.now()}`);
export const zohoInvite = (invites: { zoho_id: string; role: "agent" | "manager" }[]) =>
  cloudApi<Invited>("/api/v1/zoho/team/invite", {
    method: "POST",
    body: { invites, confirm: true },
  });
