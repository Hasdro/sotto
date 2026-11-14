/**
 * Due follow-up steps on Home (INT-08): what the scheduler made due. A desktop notification opens
 * the same step (`/?step=<id>`). Each step opens its prepared draft in the usual composer: the
 * agent previews, taps Send (with the step's own key, so a retry never sends twice), and the
 * step is marked done. A call reminder is done by the tap itself. Nothing here sends on its own.
 */
import { Button, Panel, Stack, Text } from "@sotto/ui";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useFeature } from "../../components/FeatureGate";
import { EmailAction } from "../email";
import { WhatsAppAction } from "../whatsapp";
import { type DueStep, doneStep, dueSteps, type OpenStep, openStep, skipStep } from "./api";
import { useFollowupText } from "./strings";

const errorOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function DueSteps() {
  const feature = useFeature("followup_plan");
  if (feature.state !== "available") return null;
  return <List />;
}

function List() {
  const t = useFollowupText();
  const params = useLocalSearchParams<{ step?: string }>();
  const [steps, setSteps] = useState<DueStep[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => {
    void dueSteps()
      .then((r) => setSteps(r.steps))
      .catch(() => setSteps([]));
  }, []);
  useEffect(load, [load]);
  // A notification click lands here with the step to open.
  useEffect(() => {
    if (typeof params.step === "string" && /^[a-f0-9]{16}$/.test(params.step)) setOpen(params.step);
  }, [params.step]);

  if (steps === null) return null;
  if (steps.length === 0 && !open) return null;
  return (
    <Panel testID="due-steps">
      <Stack gap="md">
        <Text variant="body" weight="semibold" accessibilityRole="header">
          {t("due.title")}
        </Text>
        {steps.map((s) => (
          <Stack key={s.id} gap="sm">
            <Stack direction="row" gap="sm" wrap>
              <Text variant="body" style={{ flex: 1, minWidth: 0 }} testID={`due-${s.id}`}>
                {t("due.step", { kind: t(`kind.${s.kind}`), name: s.customer_name })}
              </Text>
              {open === s.id ? null : (
                <Button
                  variant="secondary"
                  label={t("due.open")}
                  onPress={() => setOpen(s.id)}
                  testID={`due-open-${s.id}`}
                />
              )}
            </Stack>
            {open === s.id ? (
              <StepPanel
                id={s.id}
                onFinished={() => {
                  setOpen(null);
                  load();
                }}
              />
            ) : null}
          </Stack>
        ))}
        {open && !steps.some((s) => s.id === open) ? (
          <StepPanel id={open} onFinished={() => setOpen(null)} />
        ) : null}
      </Stack>
    </Panel>
  );
}

/** One step, opened: its draft in the usual composer, sent only by the agent's tap. */
export function StepPanel({ id, onFinished }: { id: string; onFinished: () => void }) {
  const t = useFollowupText();
  const [step, setStep] = useState<OpenStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void openStep(id)
      .then(setStep)
      .catch((e) => setError(errorOf(e)));
  }, [id]);
  const finish = (how: "done" | "skip") =>
    (how === "done" ? doneStep(id) : skipStep(id))
      .then(onFinished)
      .catch((e) => setError(errorOf(e)));

  if (error)
    return (
      <Text variant="label" tone="danger" testID="step-error">
        {error}
      </Text>
    );
  if (!step) return null;
  if (step.state !== "due" && step.state !== "pending")
    return (
      <Text variant="label" tone="muted" testID="step-finished">
        {t("step.finished")}
      </Text>
    );
  const p = step.prepared ?? {};
  return (
    <Stack gap="sm" testID={`step-${step.kind}`}>
      {step.kind === "email" ? (
        <EmailAction
          callId={step.call_id}
          prepared={p}
          idempotencyKey={step.idempotency_key}
          onSent={() => void finish("done")}
        />
      ) : step.kind === "reminder" ? (
        <Text variant="body" testID="step-reminder">
          {t("step.reminderBody", { name: step.customer_name })}
        </Text>
      ) : (
        <WhatsAppAction
          callId={step.call_id}
          customer={{ name: p.recipient?.name, phone: p.recipient?.phone }}
          preset={{ template: p.template, language: p.language, values: p.values }}
          categories={step.kind === "meeting_reminder" ? ["UTILITY"] : undefined}
          idempotencyKey={step.idempotency_key}
          onSent={() => void finish("done")}
        />
      )}
      <Stack direction="row" gap="sm" wrap>
        {step.kind === "reminder" ? (
          <Button label={t("step.done")} onPress={() => void finish("done")} testID="step-done" />
        ) : null}
        <Button
          variant="ghost"
          label={t("step.skip")}
          onPress={() => void finish("skip")}
          testID="step-skip"
        />
      </Stack>
    </Stack>
  );
}
