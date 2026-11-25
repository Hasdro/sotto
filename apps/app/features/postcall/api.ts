/**
 * Client API for style memory (A2–A4) and post-call wizard persistence (A1).
 * Calls the exported `cloudApi` helper without modifying `lib/cloud.ts` (master §3.5).
 */
import { cloudActive, cloudApi } from "../../lib/cloud";
import type { WizardStepNumber } from "./steps";
import { enqueue, logEvent } from "./stubs";

export type FeedbackSource = "card" | "call_note" | "coach_review";
export type FeedbackRating = "up" | "down";

export type FeedbackPayload = {
  call_id: string | null;
  source: FeedbackSource;
  rating: FeedbackRating | null;
  reasons: string[];
  note: string | null;
  card_id?: string | null;
};

export type StyleRule = {
  id: string;
  text: string;
  enabled: boolean;
  source_call: string | null;
  promoted_from?: string | null;
  added_at: number;
  updated_at?: number;
};

export type MemoryVersion = {
  version: number;
  status: "applied" | "pending" | "rejected";
  origin: "merge" | "edit" | "revert" | "promote" | "migration";
  source_call: string | null;
  actor: string;
  created_at: number;
  items: StyleRule[];
  active: boolean;
};

export type AgentMemoryView = {
  user_id: string;
  company_rules: StyleRule[];
  agent_rules: StyleRule[];
  effective: string[];
  pending: MemoryVersion[];
  review_before_apply: boolean;
  limits: { rules: number; words: number };
};

export type AdminAgentMemory = {
  user_id: string;
  name: string;
  email: string;
  role: string;
  active_version: number;
  items: StyleRule[];
  versions: MemoryVersion[];
  pending: number[];
  effective: string[];
};

export type AdminMemoryOverview = {
  review_before_apply: boolean;
  company: {
    active_version: number;
    items: StyleRule[];
    versions: MemoryVersion[];
    pending: number[];
  };
  agents: AdminAgentMemory[];
  limits: { rules: number; words: number };
};

export type MergeResult = {
  version: number | null;
  status: "applied" | "pending" | "noop";
  learned_count: number;
  rules: string[];
};

export type SavedWizardState = {
  call_id: string;
  current_step: WizardStepNumber;
  drafts: Record<string, unknown>;
  completed_steps: WizardStepNumber[];
  feedback_done: boolean;
  status: "in_progress" | "drafts_expired" | "done";
  saved_at: number;
  expires_drafts_at: number;
  expires_feedback_at: number;
  drafts_active: boolean;
};

export type RuleDraft = { id?: string; text: string; enabled: boolean };

export const memoryApi = {
  addFeedback: (payload: FeedbackPayload) =>
    cloudApi<{ id: string }>("/api/v1/memory/feedback", { method: "POST", body: payload }),
  merge: (callId: string | null) =>
    cloudApi<MergeResult>("/api/v1/memory/merge", { method: "POST", body: { call_id: callId } }),
  myMemory: () => cloudApi<AgentMemoryView>("/api/v1/memory/me"),
  adminOverview: () => cloudApi<AdminMemoryOverview>("/api/v1/memory/admin"),
  editRules: (scope: "company" | "agent", userId: string | null, items: RuleDraft[]) =>
    cloudApi<AdminMemoryOverview>("/api/v1/memory/rules", {
      method: "PUT",
      body: { scope, user_id: userId, items },
    }),
  revert: (scope: "company" | "agent", userId: string | null, version: number) =>
    cloudApi<AdminMemoryOverview>(`/api/v1/memory/versions/${version}/revert`, {
      method: "POST",
      body: { scope, user_id: userId },
    }),
  decide: (
    scope: "company" | "agent",
    userId: string | null,
    version: number,
    approve: boolean,
  ) =>
    cloudApi<AdminMemoryOverview>(
      `/api/v1/memory/versions/${version}/${approve ? "approve" : "reject"}`,
      { method: "POST", body: { scope, user_id: userId } },
    ),
  promote: (userId: string, ruleId: string) =>
    cloudApi<AdminMemoryOverview>("/api/v1/memory/promote", {
      method: "POST",
      body: { user_id: userId, rule_id: ruleId },
    }),
  setReview: (enabled: boolean) =>
    cloudApi<AdminMemoryOverview>("/api/v1/memory/settings", {
      method: "PUT",
      body: { review_before_apply: enabled },
    }),
};

export const wizardApi = {
  list: () => cloudApi<{ items: SavedWizardState[] }>("/api/v1/postcall/wizard"),
  get: (callId: string) => cloudApi<SavedWizardState>(`/api/v1/postcall/wizard/${callId}`),
  save: (
    callId: string,
    body: {
      current_step: WizardStepNumber;
      drafts?: Record<string, unknown>;
      completed_steps?: WizardStepNumber[];
      feedback_done?: boolean;
    },
  ) =>
    cloudApi<SavedWizardState>(`/api/v1/postcall/wizard/${callId}`, {
      method: "PUT",
      body,
    }),
  remove: (callId: string) =>
    cloudApi<{ ok: boolean }>(`/api/v1/postcall/wizard/${callId}`, { method: "DELETE" }),
};

/**
 * Submit feedback to the server; if offline or the request fails, queue it in Agent 4's outbox
 * so nothing is ever lost (A2, S4).
 */
export async function submitFeedbackOrQueue(
  payload: FeedbackPayload,
): Promise<{ queued: boolean; id?: string }> {
  if (!cloudActive()) {
    await enqueue("memory_feedback", payload as unknown as Record<string, unknown>);
    return { queued: true };
  }
  try {
    const res = await memoryApi.addFeedback(payload);
    return { queued: false, id: res.id };
  } catch (err) {
    logEvent("style_memory", "feedback_queued_offline", {
      source: payload.source,
      error: err instanceof Error ? err.name : "network_error",
    });
    await enqueue("memory_feedback", payload as unknown as Record<string, unknown>);
    return { queued: true };
  }
}
