/**
 * Zoho CRM through the management server (R10, D-031). The app never sees a Zoho token or the
 * OAuth client: it asks the server to search and to build a brief for the record the agent picks.
 */
import { cloudApi } from "../../lib/cloud";

export type Evidence = { field: "phone" | "email" | "name"; value: string };
export type Candidate = {
  module: "Contacts" | "Leads";
  id: string;
  name: string;
  title: string;
  company: string;
  email: string;
  phone: string;
  evidence: Evidence;
};
export type Meeting = {
  related?: Related | null;
  id: string;
  title: string;
  start: string;
  end: string;
  agenda: string;
  participants: string[];
};
export type Related = {
  module: "Deals" | "Accounts" | "Contacts" | "Leads";
  id: string;
  name: string;
};
export type MeetingCandidate = Meeting & {
  related?: Related | null;
  evidence: { field: "time"; value: string };
};
export type MeetingPage = { meetings: MeetingCandidate[]; page: number; more: boolean };
export type MeetingDetail = {
  id: string;
  title: string;
  start: string;
  end: string;
  participants: { name: string; email: string; type: string }[];
  related: Related | null;
  contact: { id: string; name: string } | null;
  description: string;
  venue: string;
  link: string;
};
export type Brief = {
  meeting?: Meeting;
  person: {
    module: "Contacts" | "Leads";
    id: string;
    name: string;
    title: string;
    email: string;
    phone: string;
    /** INT-16c: the campaign that brought them (Zoho Campaigns; needs the D-069 scopes). */
    campaign_info?: { name: string; type: string; status: string };
  } | null;
  account: { name: string; industry: string } | null;
  deals: {
    id: string;
    name: string;
    stage: string;
    amount: string;
    close_date: string;
    owner: string;
    /** ISO 4217 code when the org sends one (multi-currency Zoho); shown with the amount. */
    currency?: string;
  }[];
  notes: { date: string; title: string; text: string }[];
  /** The compact text the live prompt gets (`crm.brief`), capped by the server. */
  text: string;
};
export type ZohoFeature = "tasks" | "agn_fields" | "campaigns" | "notifications";
export type ZohoStatus = {
  connected: boolean;
  connected_at?: number;
  /** Connected before Zoho writes existed: reconnect to allow saving to Zoho. */
  needs_reconnect?: boolean;
  api_domain?: string;
  /** W4-SCOPES (D-069): connected before the wave-4 scope bundle; one reconnect fixes it. */
  scopes_outdated?: boolean;
  /** What the connection's scopes allow (D-069). Missing on older servers: treat as false. */
  features?: Partial<Record<ZohoFeature, boolean>>;
  feature: { state: string; cause?: string };
  client: "org" | "platform" | null;
};
export type ClientStatus = {
  platform: { configured: boolean; dc?: string; updated_at?: number };
  org: { configured: boolean; dc?: string; updated_at?: number };
  active: "org" | "platform" | null;
};

/** Never served from the short read cache: the connect screen polls it. */
export const zohoStatus = () => cloudApi<ZohoStatus>(`/api/v1/zoho/status?t=${Date.now()}`);
export const zohoConnect = () =>
  cloudApi<{ url: string }>("/api/v1/zoho/connect", { method: "POST" });
export const zohoDisconnect = () =>
  cloudApi<{ connected: false }>("/api/v1/zoho/connection", { method: "DELETE" });
export const zohoSearch = (q: string) =>
  cloudApi<{ candidates: Candidate[] }>(`/api/v1/zoho/search?q=${encodeURIComponent(q)}`);
export const zohoBrief = (c: Pick<Candidate, "module" | "id">) =>
  cloudApi<{ brief: Brief }>(
    `/api/v1/zoho/records/${encodeURIComponent(c.module)}/${encodeURIComponent(c.id)}`,
  );
export const orgClient = () => cloudApi<ClientStatus>("/api/v1/company/zoho/client");
export const removeOrgClient = () =>
  cloudApi<ClientStatus>("/api/v1/company/zoho/client", { method: "DELETE" });
/** The connected user's own upcoming meetings, soonest first, 20 a page. */
export const zohoMeetings = (page = 1) =>
  cloudApi<MeetingPage>(`/api/v1/zoho/meetings?page=${page}&t=${Date.now()}`);
export const zohoMeetingDetail = (id: string) =>
  cloudApi<{ meeting: MeetingDetail }>(`/api/v1/zoho/meetings/${encodeURIComponent(id)}/detail`);
export const zohoMeetingBrief = (id: string) =>
  cloudApi<{ brief: Brief }>(`/api/v1/zoho/meetings/${encodeURIComponent(id)}`);

export type ActionKind =
  | "meeting"
  | "lead"
  | "contact_update"
  | "deal_note"
  | "task"
  | "agn_fields";
/** One approved write (R12). The same key on a retry never writes twice (server table). */
export const zohoAction = (kind: ActionKind, fields: Record<string, string>, key: string) =>
  cloudApi<{ ok: true; id: string; action?: string; repeat?: boolean }>(
    `/api/v1/zoho/actions/${kind}`,
    { method: "POST", body: { approved: true, idempotency_key: key, fields } },
  );
export const saveCallBrief = (callId: string, brief: Record<string, unknown>) =>
  cloudApi<{ ok: true }>(`/api/v1/calls/${encodeURIComponent(callId)}/brief`, {
    method: "PUT",
    body: { brief },
  });

// --- wave 4 (T-082) ---------------------------------------------------------------------------
export type TaskOwner = { id: string; name: string; me: boolean };
/** INT-02t: who a Task can be assigned to, the connected person first. */
export const zohoOwners = () =>
  cloudApi<{ owners: TaskOwner[]; me: string }>("/api/v1/zoho/owners");

export type BlueprintItem = { api_name: string; label: string };
export type Blueprint = {
  deal_id: string;
  process: string;
  current: string;
  transitions: {
    name: string;
    to: string;
    ready: boolean;
    missing: BlueprintItem[];
    done: BlueprintItem[];
  }[];
  /** A suggested Note text; the app never executes a transition (D-056). */
  note: string;
};
export const zohoBlueprint = (dealId: string) =>
  cloudApi<Blueprint>(`/api/v1/zoho/deals/${encodeURIComponent(dealId)}/blueprint`);

export type AgnField = {
  api_name: string;
  label: string;
  type: string;
  exists: boolean;
  writable: boolean;
};
/** INT-06 (D-069): preview of the AGN Deal fields; nothing is created until confirm. */

/** INT-12 (D-072): the weekly CSV path (the caller's company, admins). */
export const weeklyExportPath = (week?: string) =>
  `/api/v1/export/weekly.csv${week ? `?week=${encodeURIComponent(week)}` : ""}`;
