/**
 * Feature flags (D-028): the ids of the server's catalog
 * (`apps/agent-worker/sotto_worker/cloud/features.json`; a test keeps both lists equal). The
 * server alone decides each state; the app only greys or hides from the map it is sent.
 */
export const FEATURE_IDS = [
  "call_review",
  "follow_up",
  "recordings",
  "reports",
  "ai_knowledge",
  "integrations",
  "zoho",
  "gallabox",
  "email_send",
  "whatsapp",
  "prep",
  "card_ratings",
  "learned_instructions",
  "followup_plan",
  "meeting_reminders",
  "whatsapp_status",
  "zoho_watch",
  "email_attachments",
  "playbook_bootstrap",
  "call_logs_github",
  "local_models_text",
  "local_models_voice",
  "setup_guide",
  "postcall_wizard",
  "style_memory",
  "card_style_v2",
  "call_state",
  "talk_meter",
  "prep_coach",
  "voice_coach",
  "morning_brief",
] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];

export type FeatureState =
  | "available"
  | "off_by_platform"
  | "off_by_org"
  | "needs_connection"
  | "no_permission";

/** One feature's state for the signed-in person; `cause` names the dependency or connection. */
export type Effective = { state: FeatureState; cause?: string };
export type FeatureMap = Partial<Record<FeatureId, Effective>>;

/** Without a map (local demo, an older server) every feature is available, as before flags. */
export function stateOf(map: FeatureMap | null | undefined, id: FeatureId): Effective {
  if (!map) return { state: "available" };
  return map[id] ?? { state: "available" };
}
