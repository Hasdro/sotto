/**
 * "Plan the next steps" under the follow-up card (INT-08, INT-09, INT-10). The agent sets the plan
 * once: email today (the card above), a WhatsApp template in n days, a reminder to call, and —
 * where the org turned meeting reminders on — a WhatsApp reminder a day before the meeting. The
 * app then reminds them at each step; each step is sent only by their own tap (R12, D-055, D-070).
 */
import { Button, Panel, SegmentedControl, Stack, Text, ToggleRow } from "@sotto/ui";
import { useCallback, useEffect, useState } from "react";
import { useFeature } from "../../components/FeatureGate";
import type { Draft } from "../email/api";
import { allowedTemplates, type Message, prefill, type Template } from "../whatsapp/api";
import {
  createPlan,
  type DeliveryStatus,
  deliveryStatus,
  type Plan,
  planSteps,
  plansFor,
  setPlan,
} from "./api";
import { useFollowupText } from "./strings";

const WA_DAYS = ["off", "1", "2", "3"] as const;
const CALL_DAYS = ["off", "3", "5", "7"] as const;
const errorOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
const days = (v: string) => (v === "off" ? null : Number(v));

export type PlanSetupProps = {
  callId: string | null;
  customer: { name: string; phone: string };
  email: Draft | null;
  emailSent: boolean;
  whatsapp: Message | null;
  /** The booked meeting's start (ms), when known (INT-09). */
  meetingAt: number | null;
};

export function PlanSetup(props: PlanSetupProps) {
  const feature = useFeature("followup_plan");
  if (feature.state !== "available" || !props.callId) return null;
  return <Setup {...props} callId={props.callId} />;
}

function Setup({
  callId,
  customer,
  email,
  emailSent,
  whatsapp,
  meetingAt,
}: PlanSetupProps & {
  callId: string;
}) {
  const t = useFollowupText();
  const wa = useFeature("whatsapp");
  const reminders = useFeature("meeting_reminders");
  const [waDays, setWaDays] = useState<string>("2");
  const [callDays, setCallDays] = useState<string>("5");
  const [remind, setRemind] = useState(false);
  const [utility, setUtility] = useState<Template | null>(null);
  const [fallback, setFallback] = useState<Template | null>(null);
  const [plan, setPlanState] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void plansFor(callId)
      .then((r) => setPlanState(r.plans[0] ?? null))
      .catch(() => {});
  }, [callId]);
  useEffect(() => {
    if (wa.state !== "available") return;
    void allowedTemplates()
      .then((r) => {
        setFallback(r.templates[0] ?? null);
        setUtility(r.templates.find((x) => x.category.toUpperCase() === "UTILITY") ?? null);
      })
      .catch(() => {});
  }, [wa.state]);

  const phone = whatsapp?.recipient.phone || customer.phone;
  const waMessage: Message | null =
    wa.state !== "available"
      ? null
      : whatsapp?.recipient.phone
        ? whatsapp
        : fallback && phone
          ? {
              template: fallback.name,
              language: fallback.language,
              recipient: { name: customer.name, phone },
              values: prefill(fallback, { name: customer.name }),
            }
          : null;
  const reminderMessage: Message | null =
    reminders.state === "available" && utility && phone && meetingAt
      ? {
          template: utility.name,
          language: utility.language,
          recipient: { name: customer.name, phone },
          values: prefill(utility, { name: customer.name }),
        }
      : null;

  const save = () => {
    const steps = planSteps({
      now: Date.now(),
      email,
      emailSent,
      whatsapp: waMessage,
      waDays: days(waDays),
      reminderDays: days(callDays),
      meetingAt,
      meetingReminder: remind ? reminderMessage : null,
    });
    if (!steps.length) return;
    setBusy(true);
    setError(null);
    createPlan({ call_id: callId, customer_name: customer.name, steps })
      .then(setPlanState)
      .catch((e) => setError(errorOf(e)))
      .finally(() => setBusy(false));
  };

  if (plan) return <PlanStatus plan={plan} onChange={setPlanState} />;
  const label = (v: string) => (v === "off" ? t("plan.off") : t("plan.inDays", { n: v }));
  return (
    <Panel testID="plan-setup">
      <Stack gap="md">
        <Text variant="body" weight="semibold" accessibilityRole="header">
          {t("plan.title")}
        </Text>
        <Text variant="label" tone="muted">
          {t("plan.hint")}
        </Text>
        <Row label={t("plan.email")}>
          <Text variant="label" tone="muted" testID="plan-email">
            {emailSent ? t("plan.emailSent") : t("plan.emailToday")}
          </Text>
        </Row>
        {wa.state === "available" ? (
          <Row label={t("plan.whatsapp")}>
            {waMessage ? (
              <SegmentedControl
                options={WA_DAYS.map((v) => ({ value: v, label: label(v) }))}
                value={waDays}
                onChange={setWaDays}
                accessibilityLabel={t("plan.whatsapp")}
                testID="plan-wa-days"
              />
            ) : (
              <Text variant="label" tone="muted" testID="plan-wa-missing">
                {fallback ? t("plan.noPhone") : t("plan.noTemplate")}
              </Text>
            )}
          </Row>
        ) : null}
        <Row label={t("plan.reminder")}>
          <SegmentedControl
            options={CALL_DAYS.map((v) => ({ value: v, label: label(v) }))}
            value={callDays}
            onChange={setCallDays}
            accessibilityLabel={t("plan.reminder")}
            testID="plan-call-days"
          />
        </Row>
        {reminderMessage ? (
          <ToggleRow
            label={t("plan.meeting")}
            description={t("plan.meetingWhen")}
            value={remind}
            onValueChange={setRemind}
            testID="plan-meeting-reminder"
          />
        ) : null}
        <Stack direction="row" gap="sm" wrap>
          <Button label={t("plan.save")} disabled={busy} onPress={save} testID="plan-save" />
        </Stack>
        {error ? (
          <Text variant="label" tone="danger" aria-live="polite" testID="plan-error">
            {t("plan.failed", { error })}
          </Text>
        ) : null}
      </Stack>
    </Panel>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Stack gap="xs">
      <Text variant="label" weight="medium" tone="muted">
        {label}
      </Text>
      {children}
    </Stack>
  );
}

/** The saved plan: each step with its state (and WhatsApp delivery, INT-10); pause or cancel. */
export function PlanStatus({ plan, onChange }: { plan: Plan; onChange: (p: Plan) => void }) {
  const t = useFollowupText();
  const status = useFeature("whatsapp_status");
  const [delivery, setDelivery] = useState<Record<string, DeliveryStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const keys = plan.steps
    .filter((s) => s.kind === "whatsapp" || s.kind === "meeting_reminder")
    .map((s) => s.idempotency_key);
  const keyList = keys.join(",");
  useEffect(() => {
    if (status.state !== "available" || !keyList) return;
    void deliveryStatus(keyList.split(","))
      .then((r) => setDelivery(r.status))
      .catch(() => {});
  }, [status.state, keyList]);
  const act = useCallback(
    (what: "pause" | "resume" | "cancel") =>
      setPlan(plan.id, what)
        .then(onChange)
        .catch((e) => setError(errorOf(e))),
    [plan.id, onChange],
  );
  const fmt = (ms: number) =>
    new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(new Date(ms));
  return (
    <Panel testID="plan-status">
      <Stack gap="sm">
        <Text variant="body" weight="semibold" accessibilityRole="header">
          {plan.status === "cancelled"
            ? t("plan.cancelled")
            : t("plan.saved", { n: plan.steps.length })}
        </Text>
        {plan.steps.map((s) => {
          const d = delivery[s.idempotency_key];
          return (
            <Text key={s.id} variant="label" testID={`plan-step-${s.kind}`}>
              {`${t(`kind.${s.kind}`)} · ${fmt(s.due_at)} · ${t(`state.${s.state}`)}${
                d ? ` · ${t(`status.${d.status}`)}` : ""
              }`}
            </Text>
          );
        })}
        {plan.status === "active" || plan.status === "paused" ? (
          <Stack direction="row" gap="sm" wrap>
            <Button
              variant="secondary"
              label={plan.status === "paused" ? t("plan.resume") : t("plan.pause")}
              onPress={() => void act(plan.status === "paused" ? "resume" : "pause")}
              testID="plan-pause"
            />
            <Button
              variant="ghost"
              label={t("plan.cancel")}
              onPress={() => void act("cancel")}
              testID="plan-cancel"
            />
          </Stack>
        ) : null}
        {error ? (
          <Text variant="label" tone="danger">
            {error}
          </Text>
        ) : null}
      </Stack>
    </Panel>
  );
}
