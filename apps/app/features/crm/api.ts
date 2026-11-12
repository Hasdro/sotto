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
export type Brief = {
  person: {
    module: "Contacts" | "Leads";
    id: string;
    name: string;
    title: string;
    email: string;
    phone: string;
  };
  account: { name: string; industry: string } | null;
  deals: { name: string; stage: string; amount: string; close_date: string; owner: string }[];
  notes: { date: string; title: string; text: string }[];
  /** The compact text the live prompt gets (`crm.brief`), capped by the server. */
  text: string;
};
export type ZohoStatus = {
  connected: boolean;
  connected_at?: number;
  api_domain?: string;
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
export const saveOrgClient = (body: { client_id: string; client_secret: string; dc: string }) =>
  cloudApi<ClientStatus>("/api/v1/company/zoho/client", { method: "PUT", body });
export const removeOrgClient = () =>
  cloudApi<ClientStatus>("/api/v1/company/zoho/client", { method: "DELETE" });
