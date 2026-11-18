/** Provider state for the Settings health panel (read-only). */
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
  /** An endpoint the owner added (Ollama, vLLM, LM Studio…): no key page; its own address. */
  custom?: boolean;
  base_url?: string | null;
  /** False: the apps cannot run this vendor yet, so no stage may pick it. */
  client?: boolean;
};

export type StageChoice = {
  id: string;
  label: string;
  kind: ProviderKind;
  provider_id: string | null;
  model: string | null;
  source: "panel" | "default";
  /** The stage's first-token deadline (the backup races after it), if it has one. */
  deadline_ms?: number | null;
  /** Live stages must meet R1; their model choice is guarded by the last speed check. */
  live?: boolean;
  benchmark?: {
    ok: boolean;
    p50_ms: number | null;
    worst_ms: number | null;
    samples: number;
    detail: string;
    at: number;
  } | null;
};

export type ProvidersState = {
  providers: Provider[];
  stages: StageChoice[];
  result?: { ok: boolean; detail: string };
  /** The company's own playbook answers (setup checklist step 3, T-037). */
  playbook_entries?: number;
};

/** Read-only: model and key management live in the owner console (D-078). */
export const keysApi = {
  list: () => api<ProvidersState>("/api/providers"),
};
