/** Playbook bootstrap against the server (ZC-04, D-066). Managers and admins, after consent. */
import { cloudApi } from "../../lib/cloud";

export type BootstrapSource = "zoho" | "website" | "document";

export type Draft = {
  id: string;
  source: BootstrapSource;
  question: string;
  answer: string;
  tags: string[];
  status: "needs_review";
  created_at: number;
};

export type BootstrapState = {
  consent: boolean;
  domains: string[];
  zoho: boolean;
  drafts: Draft[];
};

export type Pair = { question: string; answer: string };

const base = "/api/v1/playbook/bootstrap";
const enc = encodeURIComponent;

export const bootstrapApi = {
  state: () => cloudApi<BootstrapState>(base),
  material: (body: { source: "website"; url: string } | { source: "zoho" }) =>
    cloudApi<{ source: string; text: string; url?: string }>(`${base}/material`, {
      method: "POST",
      body,
    }),
  drafts: (source: BootstrapSource, items: Pair[]) =>
    cloudApi<{ added: number }>(`${base}/drafts`, { method: "POST", body: { source, items } }),
  approve: (id: string, change: Pair) =>
    cloudApi<{ id: string; status: "approved"; playbook_id: string }>(
      `${base}/drafts/${enc(id)}/approve`,
      { method: "POST", body: change },
    ),
  reject: (id: string) =>
    cloudApi<{ id: string; status: "rejected" }>(`${base}/drafts/${enc(id)}/reject`, {
      method: "POST",
      body: {},
    }),
};
