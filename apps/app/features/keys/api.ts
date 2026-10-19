/**
 * Keys & providers API client (P6.7, D-020). Keys go up once and never come back: the server
 * answers with status only (set / where / last test), never a key.
 */
import { api } from "../../lib/server";

export type ProviderKind = "llm" | "stt";

export type Provider = {
  id: string;
  name: string;
  kind: ProviderKind;
  key_page: string;
  steps: string;
  free: string;
  key_set: boolean;
  key_source: "panel" | "server" | null;
  updated_at: number | null;
  test: { ok: boolean; at: number | null; detail: string | null } | null;
  models: string[];
};

export type StageChoice = {
  id: string;
  label: string;
  kind: ProviderKind;
  provider_id: string | null;
  model: string | null;
  source: "panel" | "default";
};

export type ProvidersState = {
  providers: Provider[];
  stages: StageChoice[];
  result?: { ok: boolean; detail: string };
};

const enc = encodeURIComponent;

export const keysApi = {
  list: () => api<ProvidersState>("/api/providers"),
  saveKey: (id: string, key: string) =>
    api<ProvidersState>(`/api/providers/${enc(id)}/key`, { method: "PUT", body: { key } }),
  removeKey: (id: string) =>
    api<ProvidersState>(`/api/providers/${enc(id)}/key`, { method: "DELETE" }),
  test: (id: string) =>
    api<ProvidersState>(`/api/providers/${enc(id)}/test`, { method: "POST", body: {} }),
  setStage: (stage: string, providerId: string, model: string) =>
    api<ProvidersState>(`/api/stages/${enc(stage)}`, {
      method: "PUT",
      body: { provider_id: providerId, model },
    }),
  resetStage: (stage: string) =>
    api<ProvidersState>(`/api/stages/${enc(stage)}`, { method: "DELETE" }),
};

/** Status badge for a provider: what the admin should know at a glance. */
export function keyStatus(p: Provider): "none" | "ok" | "failed" | "panel" | "server" {
  if (!p.key_set) return "none";
  if (p.test?.ok === true) return "ok";
  if (p.test?.ok === false) return "failed";
  return p.key_source === "server" ? "server" : "panel";
}
