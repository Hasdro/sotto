/**
 * Follow-up plans (INT-08, INT-09; D-055, D-070). The server only keeps the plan and makes each
 * step due at its time; it never sends. A due step is opened by the agent, previewed and sent
 * through the usual email / WhatsApp route with the step's own idempotency key, then marked done.
 */
import { cloudApi } from "../../lib/cloud";
import type { Draft } from "../email/api";
import type { Message } from "../whatsapp/api";

export type StepKind = "email" | "whatsapp" | "reminder" | "meeting_reminder";
export type StepState = "pending" | "due" | "done" | "skipped" | "cancelled";
export type Step = {
  id: string;
  plan_id: string;
  position: number;
  kind: StepKind;
  due_at: number;
  state: StepState;
  idempotency_key: string;
};
export type DueStep = Step & { customer_name: string; call_id: string };
export type OpenStep = DueStep & {
  plan_status: "active" | "paused" | "cancelled" | "done";
  prepared?: Partial<Draft> & Partial<Message> & { note?: string; meeting_at?: number };
};
export type Plan = {
  id: string;
  call_id: string;
  customer_name: string;
  status: "active" | "paused" | "cancelled" | "done";
  created_at: number;
  steps: Step[];
};
export type NewStep = {
  kind: StepKind;
  due_at: number;
  prepared?: Record<string, unknown>;
};
export type DeliveryStatus = { status: "sent" | "delivered" | "read" | "failed"; at: number };

export const createPlan = (body: { call_id: string; customer_name: string; steps: NewStep[] }) =>
  cloudApi<Plan>("/api/v1/followup/plans", { method: "POST", body });
export const plansFor = (callId: string) =>
  cloudApi<{ plans: Plan[] }>(
    `/api/v1/followup/plans?call_id=${encodeURIComponent(callId)}&t=${Date.now()}`,
  );
export const setPlan = (id: string, what: "pause" | "resume" | "cancel") =>
  cloudApi<Plan>(`/api/v1/followup/plans/${id}/${what}`, { method: "POST" });
export const dueSteps = () =>
  cloudApi<{ steps: DueStep[] }>(`/api/v1/followup/due?t=${Date.now()}`);
export const openStep = (id: string) =>
  cloudApi<OpenStep>(`/api/v1/followup/steps/${id}?t=${Date.now()}`);
export const skipStep = (id: string) =>
  cloudApi<{ status: "skipped" }>(`/api/v1/followup/steps/${id}/skip`, { method: "POST" });
export const doneStep = (id: string) =>
  cloudApi<{ status: "done"; duplicate: boolean }>(`/api/v1/followup/steps/${id}/done`, {
    method: "POST",
  });
/** INT-10: delivery status of WhatsApp sends, by their idempotency keys. */
export const deliveryStatus = (keys: string[]) =>
  cloudApi<{ status: Record<string, DeliveryStatus> }>(
    `/api/v1/whatsapp/status?keys=${keys.map(encodeURIComponent).join(",")}&t=${Date.now()}`,
  );

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;

/** The steps the agent chose (INT-08): email today, WhatsApp in `waDays`, call reminder. */
export function planSteps(input: {
  now: number;
  email: Draft | null;
  emailSent: boolean;
  whatsapp: Message | null;
  waDays: number | null;
  reminderDays: number | null;
  meetingAt: number | null;
  meetingReminder: Message | null;
}): NewStep[] {
  const steps: NewStep[] = [];
  if (input.email && !input.emailSent)
    steps.push({ kind: "email", due_at: input.now, prepared: input.email });
  if (input.whatsapp && input.waDays !== null)
    steps.push({
      kind: "whatsapp",
      due_at: input.now + input.waDays * DAY_MS,
      prepared: input.whatsapp,
    });
  if (input.reminderDays !== null)
    steps.push({
      kind: "reminder",
      due_at: input.now + input.reminderDays * DAY_MS,
      prepared: { note: "" },
    });
  // INT-09: one reminder a day before the meeting, if that is still ahead.
  if (input.meetingReminder && input.meetingAt && input.meetingAt - DAY_MS > input.now)
    steps.push({
      kind: "meeting_reminder",
      due_at: input.meetingAt - DAY_MS,
      prepared: { ...input.meetingReminder, meeting_at: input.meetingAt },
    });
  return steps;
}
