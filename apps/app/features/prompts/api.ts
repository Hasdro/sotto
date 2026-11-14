/**
 * Company prompt studio API (DD-2, R6; D-059: only while AGN allows BYO). The server keeps every
 * version; the next session config carries the published one (the most specific level wins).
 */
import { cloudApi } from "../../lib/cloud";

export type PromptTest = {
  passed: boolean;
  synthetic: boolean;
  quality: number;
  p50_ms?: number;
  p95_ms?: number;
  detail: string;
};

export type PromptVersionRow = {
  id: string;
  key: string;
  scope: "platform" | "company" | "team" | "campaign";
  version: number;
  body: string;
  status: "draft" | "published" | "retired";
  created_at: number;
  published_at: number | null;
  test: PromptTest | null;
};

export type StudioKey = {
  key: string;
  stage: string;
  variables: string[];
  seed: { version: number; body: string };
  versions: PromptVersionRow[];
};

const enc = encodeURIComponent;

export const promptsApi = {
  list: () => cloudApi<{ prompts: StudioKey[] }>("/api/v1/company/prompts"),
  create: (key: string, body: string) =>
    cloudApi<PromptVersionRow>("/api/v1/company/prompts", {
      method: "POST",
      body: { key, body, scope: "company" },
    }),
  test: (id: string) =>
    cloudApi<PromptVersionRow>(`/api/v1/company/prompts/${enc(id)}/test`, {
      method: "POST",
      body: {},
    }),
  publish: (id: string) =>
    cloudApi<PromptVersionRow>(`/api/v1/company/prompts/${enc(id)}/publish`, {
      method: "POST",
      body: {},
    }),
  unpublish: (id: string) =>
    cloudApi<PromptVersionRow>(`/api/v1/company/prompts/${enc(id)}/unpublish`, {
      method: "POST",
      body: {},
    }),
};

/** The version calls use now: the company's published one, else AGN's. */
export function liveOf(p: StudioKey): PromptVersionRow | null {
  return p.versions.find((v) => v.status === "published") ?? null;
}

/** A version may be published once it passed its test, or if it was live before (rollback). */
export function canPublish(v: PromptVersionRow): boolean {
  return v.status !== "published" && (v.test?.passed === true || v.published_at !== null);
}
