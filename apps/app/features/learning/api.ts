/** Learned-instruction editor and rating aggregates (T-060, T-058) against the server. */
import { cloudApi } from "../../lib/cloud";

export type Instruction = {
  id: string;
  text: string;
  enabled: boolean;
  source_call: string | null;
  /** UX-06c: who the call was with, as the agent's device named it. */
  source_label?: string;
  added_at: number;
};

export type LearnedVersion = {
  version: number;
  status: "applied" | "pending" | "rejected";
  origin: "learning" | "edit" | "revert";
  source_call: string | null;
  actor: string;
  created_at: number;
  items: Instruction[];
  active: boolean;
};

export type Learning = {
  active_version: number;
  review_before_apply: boolean;
  items: Instruction[];
  versions: LearnedVersion[];
  pending: number[];
  new: number;
  limits: { items: number; words: number };
};

export type RatingSummary = {
  days: number;
  total: number;
  up: number;
  down: number;
  calls: number;
  reasons: Record<string, number>;
  by_type: Record<string, { up: number; down: number }>;
  people: { name: string; up: number; down: number }[];
};

export type Draft = { id?: string; text: string; enabled: boolean };

export const learningApi = {
  get: () => cloudApi<Learning>("/api/v1/learning"),
  summary: () => cloudApi<RatingSummary>("/api/v1/ratings/summary?days=30"),
  save: (items: Draft[]) =>
    cloudApi<Learning>("/api/v1/learning/instructions", { method: "PUT", body: { items } }),
  revert: (v: number) =>
    cloudApi<Learning>(`/api/v1/learning/versions/${v}/revert`, { method: "POST", body: {} }),
  decide: (v: number, approve: boolean) =>
    cloudApi<Learning>(`/api/v1/learning/versions/${v}/${approve ? "approve" : "reject"}`, {
      method: "POST",
      body: {},
    }),
  setReview: (on: boolean) =>
    cloudApi<Learning>("/api/v1/learning/settings", {
      method: "PUT",
      body: { review_before_apply: on },
    }),
  seen: () => cloudApi("/api/v1/learning/seen", { method: "POST", body: {} }),
};

export const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
