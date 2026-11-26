/**
 * Client API for Round 4 Agent 3: prep coach, game plans, review queue, voice review,
 * morning brief, and company coach settings. Calls `cloudApi` from `lib/cloud.ts`.
 */

import { cloudApi } from "../../lib/cloud";
import { registerOutboxSender } from "../../lib/outbox";

export type PrepMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: number;
};

export type GamePlanObjection = {
  objection: string;
  answer: string;
};

export type GamePlan = {
  call_id: string;
  goals: string[];
  objections: GamePlanObjection[];
  questions: string[];
  avoid: string[];
  rendered_text: string;
  updated_at: number;
};

export type ReviewStatus = "pending" | "done" | "snoozed" | "dismissed" | "cancelled" | "expired";

export type CoachReviewItem = {
  id: string;
  call_id: string;
  user_id: string;
  call_duration_s: number;
  status: ReviewStatus;
  snoozed_until: number | null;
  reminded_at: number | null;
  expires_at: number;
  feedback_note: string | null;
  created_at: number;
  updated_at: number;
};

export type MorningBrief = {
  id: string;
  day: string;
  mode: "text" | "voice";
  delivered_at: number;
  content: {
    day: string;
    has_zoho_meetings: boolean;
    meetings: { title: string; start?: string }[];
    tip: string;
    pending_reviews_count: number;
    summary_text: string;
  };
};

export type MorningBriefPrefs = {
  enabled: boolean;
  timezone_offset_min: number;
  last_sent_day: string | null;
};

export type CoachSettings = {
  company_id: string;
  month: string;
  enabled: boolean;
  stages_configured: boolean;
  available: boolean;
  reason: string;
  cap_usd: number | null;
  cap_minutes: number | null;
  cost_per_min_usd: number;
  spend_usd: number;
  used_minutes: number;
  ratio: number | null;
  allow_admin_transcript: boolean;
};

export async function listPrepMessages(callId: string): Promise<PrepMessage[]> {
  const res = await cloudApi<{ messages: PrepMessage[] }>(
    `/api/v1/coach/prep/${encodeURIComponent(callId)}/messages`,
  );
  return res.messages;
}

export async function sendPrepMessage(
  callId: string,
  payload: {
    message: string;
    crm_brief?: string;
    prep_notes?: string;
    playbook?: string;
    voice?: boolean;
  },
): Promise<{ message: PrepMessage; voice: boolean; audio_bytes: number }> {
  return cloudApi(`/api/v1/coach/prep/${encodeURIComponent(callId)}/chat`, {
    method: "POST",
    body: payload,
  });
}

export async function getGamePlan(callId: string): Promise<GamePlan | null> {
  const res = await cloudApi<{ game_plan: GamePlan | null }>(
    `/api/v1/coach/prep/${encodeURIComponent(callId)}/game-plan`,
  );
  return res.game_plan;
}

export async function generateGamePlan(
  callId: string,
  payload: { crm_brief?: string; prep_notes?: string },
): Promise<GamePlan> {
  const res = await cloudApi<{ game_plan: GamePlan }>(
    `/api/v1/coach/prep/${encodeURIComponent(callId)}/game-plan`,
    { method: "POST", body: payload },
  );
  return res.game_plan;
}

export async function saveGamePlan(
  callId: string,
  plan: Pick<GamePlan, "goals" | "objections" | "questions" | "avoid">,
): Promise<GamePlan> {
  const res = await cloudApi<{ game_plan: GamePlan }>(
    `/api/v1/coach/prep/${encodeURIComponent(callId)}/game-plan`,
    { method: "PUT", body: plan },
  );
  return res.game_plan;
}

export async function enqueueReview(
  callId: string,
  callDurationS: number,
): Promise<CoachReviewItem | null> {
  const res = await cloudApi<{ review: CoachReviewItem | null }>("/api/v1/coach/reviews/enqueue", {
    method: "POST",
    body: { call_id: callId, call_duration_s: callDurationS },
  });
  return res.review;
}

export async function listReviewQueue(): Promise<{
  reviews: CoachReviewItem[];
  pending_count: number;
}> {
  return cloudApi("/api/v1/coach/reviews");
}

export async function snoozeReview(
  reviewId: string,
  preset: "1h" | "tomorrow_morning" | "custom",
  opts?: { until_ms?: number; timezone_offset_min?: number },
): Promise<CoachReviewItem> {
  const res = await cloudApi<{ review: CoachReviewItem }>(
    `/api/v1/coach/reviews/${encodeURIComponent(reviewId)}/snooze`,
    { method: "POST", body: { preset, ...opts } },
  );
  return res.review;
}

export async function dismissReview(reviewId: string): Promise<CoachReviewItem> {
  const res = await cloudApi<{ review: CoachReviewItem }>(
    `/api/v1/coach/reviews/${encodeURIComponent(reviewId)}/dismiss`,
    { method: "POST" },
  );
  return res.review;
}

export async function completeReview(
  reviewId: string,
  payload: {
    transcript: { role: string; content: string }[];
    remember_note?: string;
    duration_s: number;
    voice: boolean;
  },
): Promise<{ review: CoachReviewItem; feedback_id: string | null }> {
  return cloudApi(`/api/v1/coach/reviews/${encodeURIComponent(reviewId)}/complete`, {
    method: "POST",
    body: payload,
  });
}

export async function getMorningBrief(): Promise<{
  brief: MorningBrief;
  prefs: MorningBriefPrefs;
}> {
  return cloudApi("/api/v1/coach/morning-brief");
}

export async function setMorningBriefPrefs(
  enabled: boolean,
  timezone_offset_min = -new Date().getTimezoneOffset(),
): Promise<MorningBriefPrefs> {
  const res = await cloudApi<{ prefs: MorningBriefPrefs }>("/api/v1/coach/morning-brief/prefs", {
    method: "PUT",
    body: { enabled, timezone_offset_min },
  });
  return res.prefs;
}

export async function getCoachSettings(): Promise<CoachSettings> {
  return cloudApi("/api/v1/coach/settings");
}

export async function setAdminTranscriptAccess(allow: boolean): Promise<{
  allow_admin_transcript: boolean;
}> {
  return cloudApi("/api/v1/coach/settings", {
    method: "PUT",
    body: { allow_admin_transcript: allow },
  });
}

let outboxSendersInstalled = false;

export function initCoachOutboxSenders(): void {
  if (outboxSendersInstalled) return;
  outboxSendersInstalled = true;
  registerOutboxSender("coach_prep_message", async (payload) => {
    const p = payload as {
      callId: string;
      message: string;
      crm_brief?: string;
      prep_notes?: string;
    };
    await sendPrepMessage(p.callId, {
      message: p.message,
      ...(p.crm_brief ? { crm_brief: p.crm_brief } : {}),
      ...(p.prep_notes ? { prep_notes: p.prep_notes } : {}),
      voice: false,
    });
  });
  registerOutboxSender("coach_review_complete", async (payload) => {
    const p = payload as {
      reviewId?: string;
      callId: string;
      transcript: { role: string; content: string }[];
      remember_note?: string;
      duration_s: number;
      voice: boolean;
    };
    await completeReview(p.reviewId ?? p.callId, {
      transcript: p.transcript,
      ...(p.remember_note ? { remember_note: p.remember_note } : {}),
      duration_s: p.duration_s,
      voice: p.voice,
    });
  });
}
