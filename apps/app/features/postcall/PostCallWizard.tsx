/**
 * Post-Call Wizard (Round 4, A1): calm step-by-step popup after a call (>= 30s).
 * Steps: 1 Review -> 2 WhatsApp -> 3 Email -> 4 Zoho actions -> 5 Card feedback.
 * - Steps 2–4 hidden when their feature is off or nothing is suggested.
 * - Back / Skip / Next on every step + progress dots; Next/Skip NEVER send (R12).
 * - Each step wrapped in <SafeBoundary name="wizard.stepN"> (Agent 4 stub).
 * - Step 1 shows "Talk it through" when `voice_coach` is available (calls Agent 3 stub).
 * - "Finish later" persists the step + unsent drafts server-side for 24h (feedback stays 7d).
 */
import { Button, Panel, radius, Stack, space, Text, useTheme } from "@sotto/ui";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFeature } from "../../components/FeatureGate";
import { useReview } from "../../lib/deviceHistory";
import type { Perform } from "../actions/ActionCard";
import { AfterCallChecklist, type SaveLog } from "../actions/AfterCallChecklist";
import type { CardView } from "../cards/reducer";
import { useAttached } from "../crm/attached";
import { EmailAction } from "../email";
import { CallReviewPanel } from "../review/CallReviewPanel";
import { WhatsAppAction } from "../whatsapp";
import { type SavedWizardState, wizardApi } from "./api";
import { FeedbackStep } from "./FeedbackStep";
import {
  computeVisibleSteps,
  goBack,
  goNext,
  goSkip,
  initWizardNav,
  shouldOpenWizard,
  type WizardStepDef,
  type WizardStepNumber,
} from "./steps";
import { type PostCallKey, usePostCallText } from "./strings";
import { logEvent, SafeBoundary, startReview } from "./stubs";

export type PostCallWizardProps = {
  callId: string | null;
  /** Call duration in seconds; calls < 30 s show no wizard and no review (A1). */
  durationS: number;
  /** Cards shown during the call (for Step 5 feedback). */
  cards: readonly CardView[];
  /** Suggested follow-up flags so steps 2–4 hide when nothing is suggested. */
  whatsappSuggested?: boolean;
  emailSuggested?: boolean;
  zohoSuggested?: boolean;
  /** Optional saved state when resuming from the queue. */
  initialSaved?: SavedWizardState | null;
  perform?: Perform;
  saveLog?: SaveLog;
  onFinish?: () => void;
  onFinishLater?: (savedStep: WizardStepNumber) => void;
};

const STEP_LABEL: Record<WizardStepDef["id"], PostCallKey> = {
  review: "wizard.step.review",
  whatsapp: "wizard.step.whatsapp",
  email: "wizard.step.email",
  zoho: "wizard.step.zoho",
  feedback: "wizard.step.feedback",
};

export function PostCallWizard({
  callId,
  durationS,
  cards,
  whatsappSuggested = true,
  emailSuggested = true,
  zohoSuggested = true,
  initialSaved = null,
  perform,
  saveLog,
  onFinish,
  onFinishLater,
}: PostCallWizardProps) {
  const ft = usePostCallText();
  const { color } = useTheme();
  const wizardFlag = useFeature("postcall_wizard");
  const waFlag = useFeature("whatsapp");
  const emailFlag = useFeature("email_send");
  const zohoFlag = useFeature("zoho");
  // ASSUMPTION: `voice_coach` is registered by Agent 3 in features.json; cast safely until merge.
  const voiceCoachFlag = useFeature("voice_coach" as never);
  const review = useReview(callId);
  const crm = useAttached();
  const person = crm.kind === "attached" ? crm.brief.person : null;

  const draftsExpired = initialSaved?.status === "drafts_expired";
  const visible = useMemo(
    () =>
      computeVisibleSteps({
        durationS,
        wizardEnabled: wizardFlag.state === "available",
        whatsappEnabled: waFlag.state === "available",
        whatsappSuggested,
        emailEnabled: emailFlag.state === "available",
        emailSuggested,
        zohoEnabled: zohoFlag.state === "available",
        zohoSuggested,
        draftsExpired,
      }),
    [
      durationS,
      wizardFlag.state,
      waFlag.state,
      whatsappSuggested,
      emailFlag.state,
      emailSuggested,
      zohoFlag.state,
      zohoSuggested,
      draftsExpired,
    ],
  );

  const [nav, setNav] = useState(() => initWizardNav(visible, initialSaved?.current_step));
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, unknown>>(initialSaved?.drafts ?? {});

  useEffect(() => {
    setNav((prev) => initWizardNav(visible, prev.steps[prev.index]?.number ?? initialSaved?.current_step));
  }, [visible, initialSaved?.current_step]);

  if (!shouldOpenWizard({ durationS, wizardEnabled: wizardFlag.state === "available" })) {
    return null;
  }
  const current = nav.steps[nav.index];
  if (!current) return null;
  const isFirst = nav.index === 0;
  const isLast = nav.index === nav.steps.length - 1;

  const handleFinishLater = async () => {
    if (callId) {
      try {
        await wizardApi.save(callId, {
          current_step: current.number,
          drafts,
          completed_steps: [...nav.completed],
          feedback_done: false,
        });
      } catch {
        // Keep local notice even if offline; server state syncs when back online.
      }
    }
    logEvent("postcall_wizard", "finish_later", { step: current.number });
    setSavedNotice(ft("wizard.savedNotice"));
    onFinishLater?.(current.number);
  };

  const handleDone = async () => {
    if (callId) {
      try {
        await wizardApi.remove(callId);
      } catch {
        // Non-blocking cleanup.
      }
    }
    onFinish?.();
  };

  const renderStepBody = () => {
    switch (current.id) {
      case "review":
        return (
          <Stack gap="md">
            <CallReviewPanel callId={callId} />
            {voiceCoachFlag.state === "available" && callId ? (
              <View style={styles.coachRow}>
                <Button
                  testID="wizard-talk-it-through"
                  variant="secondary"
                  label={ft("wizard.talkItThrough")}
                  onPress={() => void startReview(callId)}
                />
              </View>
            ) : null}
          </Stack>
        );
      case "whatsapp":
        return (
          <WhatsAppAction
            callId={callId}
            customer={{
              ...(person?.name ? { name: person.name } : {}),
              ...(person?.phone ? { phone: person.phone } : {}),
            }}
            onChoose={(msg) => setDrafts((d) => ({ ...d, whatsapp: msg }))}
          />
        );
      case "email":
        return (
          <EmailAction
            callId={callId}
            customer={{
              ...(person?.name ? { name: person.name } : {}),
              ...(person?.email ? { email: person.email } : {}),
            }}
            onDraft={(d) => setDrafts((prev) => ({ ...prev, email: d }))}
          />
        );
      case "zoho":
        return callId ? (
          <AfterCallChecklist
            callId={callId}
            review={review.status === "ready" ? review.review : null}
            {...(perform ? { perform } : {})}
            {...(saveLog ? { saveLog } : {})}
          />
        ) : null;
      case "feedback":
        return <FeedbackStep callId={callId} cards={cards} />;
    }
  };

  return (
    <Panel testID="postcall-wizard" style={styles.shell}>
      <Stack gap="md">
        <View style={styles.topRow}>
          <View style={styles.grow}>
            <Text variant="label" tone="muted" testID="wizard-step-counter">
              {ft("wizard.stepOf", { current: nav.index + 1, total: nav.steps.length })}
            </Text>
            <Text variant="heading" weight="semibold" accessibilityRole="header">
              {ft(STEP_LABEL[current.id])}
            </Text>
          </View>
          <View
            style={styles.dots}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 1, max: nav.steps.length, now: nav.index + 1 }}
            testID="wizard-progress-dots"
          >
            {nav.steps.map((s, idx) => (
              <View
                key={s.id}
                testID={`wizard-dot-${s.number}`}
                style={[
                  styles.dot,
                  {
                    backgroundColor: idx <= nav.index ? color.primary : color.border,
                  },
                ]}
              />
            ))}
          </View>
        </View>

        {draftsExpired ? (
          <Text variant="label" tone="muted" testID="wizard-drafts-expired">
            {ft("wizard.draftsExpired")}
          </Text>
        ) : null}

        <SafeBoundary name={current.boundaryName}>
          <View testID={`wizard-step-${current.number}`}>{renderStepBody()}</View>
        </SafeBoundary>

        {current.id === "whatsapp" || current.id === "email" || current.id === "zoho" ? (
          <Text variant="label" tone="muted" testID="wizard-no-auto-send-note">
            {ft("wizard.sendNote")}
          </Text>
        ) : null}

        {savedNotice ? (
          <Text variant="label" tone="muted" accessibilityLiveRegion="polite" testID="wizard-saved">
            {savedNotice}
          </Text>
        ) : null}

        <View style={[styles.footer, { borderTopColor: color.border }]}>
          <View style={styles.footerGroup}>
            {!isFirst ? (
              <Button
                testID="wizard-back"
                variant="secondary"
                label={ft("wizard.back")}
                onPress={() => setNav((prev) => goBack(prev))}
              />
            ) : null}
            <Button
              testID="wizard-finish-later"
              variant="ghost"
              label={ft("wizard.finishLater")}
              onPress={() => void handleFinishLater()}
            />
          </View>
          <View style={styles.footerGroup}>
            {!isLast ? (
              <Button
                testID="wizard-skip"
                variant="ghost"
                label={ft("wizard.skip")}
                onPress={() => setNav((prev) => goSkip(prev))}
              />
            ) : null}
            <Button
              testID={isLast ? "wizard-done" : "wizard-next"}
              variant="primary"
              label={isLast ? ft("wizard.done") : ft("wizard.next")}
              onPress={() => {
                if (isLast) void handleDone();
                else setNav((prev) => goNext(prev));
              }}
            />
          </View>
        </View>
      </Stack>
    </Panel>
  );
}

const styles = StyleSheet.create({
  shell: { width: "100%", maxWidth: 720, alignSelf: "center" },
  topRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.md },
  grow: { flex: 1 },
  dots: { flexDirection: "row", alignItems: "center", gap: space.xs },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  coachRow: { flexDirection: "row", justifyContent: "flex-start" },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: space.sm,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerGroup: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.sm },
});
