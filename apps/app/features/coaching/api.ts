/** Coaching view, weekly email and playbook suggestions against the server (INT-05, INT-15). */
import { cloudApi } from "../../lib/cloud";
import type { CallSignals } from "./signals";

export type Skill = "opening" | "discovery" | "listening" | "objections" | "clarity" | "next_step";
export const SKILLS: readonly Skill[] = [
  "opening",
  "discovery",
  "listening",
  "objections",
  "clarity",
  "next_step",
];

export type CoachPerson = {
  user_id: string;
  name: string;
  role: "agent" | "manager" | "admin";
  me: boolean;
  calls: number;
  rated: number;
  not_helpful: number;
  rejected: Record<string, number>;
  reasons: Record<string, number>;
  objections: Record<string, number>;
  skills: Partial<Record<Skill, number>>;
  weakest: Skill | null;
};

export type Coaching = {
  scope: "self" | "team" | "company";
  days: number;
  ranking: false;
  people: CoachPerson[];
  objections: Record<string, number>;
  learned: string[];
};

export type Suggestion = {
  id: string;
  source: "ratings" | "escalation";
  question: string;
  answer: string;
  samples: string[];
  calls: number;
  reason: string;
  status: "open" | "approved" | "rejected";
  created_at: number;
  playbook_id: string | null;
};

export type Digest = { weekly: boolean; last_sent_at: number | null };

export const coachingApi = {
  view: (days = 30) => cloudApi<Coaching>(`/api/v1/coaching?days=${days}`),
  signals: (s: CallSignals) => cloudApi("/api/v1/coaching/signals", { method: "POST", body: s }),
  digest: () => cloudApi<Digest>("/api/v1/coaching/digest"),
  setDigest: (weekly: boolean) =>
    cloudApi<Digest>("/api/v1/coaching/digest", { method: "PUT", body: { weekly } }),
  preview: () =>
    cloudApi<{ sent: boolean; subject: string; text: string }>("/api/v1/coaching/digest/preview", {
      method: "POST",
      body: {},
    }),
  suggestions: () =>
    cloudApi<{ items: Suggestion[]; open: number }>("/api/v1/playbook/suggestions"),
  approve: (id: string, change: { question: string; answer: string }) =>
    cloudApi<{ id: string; status: "approved" }>(
      `/api/v1/playbook/suggestions/${encodeURIComponent(id)}/approve`,
      { method: "POST", body: change },
    ),
  reject: (id: string) =>
    cloudApi<{ id: string; status: "rejected" }>(
      `/api/v1/playbook/suggestions/${encodeURIComponent(id)}/reject`,
      { method: "POST", body: {} },
    ),
};
