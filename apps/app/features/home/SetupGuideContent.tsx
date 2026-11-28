/**
 * Shared role-aware Setup Guide content (L2):
 * Plain-language step explanation, recommended default, live status, real "Test it" checks
 * (when signed in, falling back to local facts when offline), and "Fix it" navigation.
 */
import { Badge, Button, radius, Stack, space, Text, useTheme } from "@sotto/ui";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFeature } from "../../components/FeatureGate";
import { cloudActive, cloudApi } from "../../lib/cloud";
import { usePrefs } from "../../lib/prefs";
import { useRole } from "../../lib/role";
import { useCloud } from "../../lib/useCloud";
import { practiceScenario } from "../call/practice";
import { useZoho } from "../crm/useZoho";
import { guideStepsFor, type SetupFacts, type SetupStep } from "./setup";
import { useHomeText } from "./strings";

export type StepTester = (
  step: SetupStep,
  facts: SetupFacts,
) => Promise<{ ok: boolean; detail: string }>;

async function runLiveCheck(step: SetupStep, facts: SetupFacts): Promise<boolean> {
  if (!cloudActive()) return step.done(facts);
  if (step.id === "zoho") {
    const res = await cloudApi<{ connected: boolean; needs_reconnect?: boolean }>(
      "/api/v1/zoho/status",
    );
    return Boolean(res.connected && !res.needs_reconnect);
  }
  if (step.id === "messaging") {
    const res = await cloudApi<{ features?: Record<string, { state?: string }> }>(
      "/api/v1/features",
    );
    const emailOk = res.features?.email_send?.state === "available";
    const waOk = res.features?.whatsapp?.state === "available";
    return emailOk || waOk;
  }
  if (step.id === "playbook") {
    const res = await cloudApi<{ playbook?: unknown[] }>("/api/v1/bundle");
    return Array.isArray(res.playbook) && res.playbook.length > 0;
  }
  if (step.id === "audio") {
    const media = (globalThis as { navigator?: Navigator }).navigator?.mediaDevices;
    if (media?.enumerateDevices) {
      const devices = await media.enumerateDevices();
      const hasInput = devices.some((d) => d.kind === "audioinput");
      return facts.audioChecked || hasInput;
    }
  }
  return step.done(facts);
}

export const defaultTester: StepTester = async (step, facts) => {
  let ok = step.done(facts);
  try {
    ok = await runLiveCheck(step, facts);
  } catch {
    ok = step.done(facts);
  }
  const summary = step.statusLine ? step.statusLine(facts) : step.id;
  return {
    ok,
    detail: ok ? `${summary} (verified)` : `${summary} — open Fix it to complete.`,
  };
};

export function SetupGuideView({
  facts,
  tester = defaultTester,
  onNavigate = (href: string) => router.push(href),
}: {
  facts: SetupFacts;
  tester?: StepTester;
  onNavigate?: (href: string) => void;
}) {
  const { color } = useTheme();
  const ht = useHomeText();
  const steps = guideStepsFor(facts);
  const [results, setResults] = useState<Record<string, { ok: boolean; detail: string }>>({});
  const [testingId, setTestingId] = useState<string | null>(null);

  const runTest = async (step: SetupStep) => {
    setTestingId(step.id);
    try {
      const res = await tester(step, facts);
      setResults((prev) => ({ ...prev, [step.id]: res }));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <Stack gap="lg" testID="setup-guide">
      <Stack gap="xs">
        <Text variant="heading" weight="semibold" accessibilityRole="header">
          {ht("guide.title")}
        </Text>
        <Text variant="body" color={color.textMuted}>
          {ht("guide.intro")}
        </Text>
      </Stack>

      {steps.map((step) => {
        const ok = results[step.id]?.ok ?? step.done(facts);
        const statusText =
          results[step.id]?.detail ?? (step.statusLine ? step.statusLine(facts) : step.id);
        return (
          <View
            key={step.id}
            testID={`setup-guide-step-${step.id}`}
            style={{
              backgroundColor: color.surface,
              borderColor: color.border,
              borderWidth: 1,
              borderRadius: radius.lg,
              padding: space.lg,
            }}
          >
            <Stack gap="sm">
              <View style={styles.headerRow}>
                <Text variant="title" weight="semibold">
                  {step.title ?? step.id}
                </Text>
                <Badge
                  tone={ok ? "neutral" : "notice"}
                  label={statusText}
                  testID={`setup-guide-status-${step.id}`}
                />
              </View>
              <Text variant="body">{step.whatItDoes ?? ""}</Text>
              <Text variant="label" color={color.textMuted}>
                Recommended default: {step.recommendedDefault ?? ""}
              </Text>
              <View style={styles.actions}>
                <Button
                  variant="secondary"
                  label={testingId === step.id ? ht("guide.testing") : ht("guide.test")}
                  onPress={() => void runTest(step)}
                  disabled={testingId === step.id}
                  testID={`setup-guide-test-${step.id}`}
                />
                {!ok ? (
                  <Button
                    variant="primary"
                    label={ht("guide.fix")}
                    onPress={() => onNavigate(step.href)}
                    testID={`setup-guide-fix-${step.id}`}
                  />
                ) : null}
              </View>
            </Stack>
          </View>
        );
      })}
    </Stack>
  );
}

/** Hooks up live cloud/role/device facts for the interactive Setup Guide screen. */
export function LiveSetupGuide() {
  const cloud = useCloud();
  const { role } = useRole();
  const prefs = usePrefs();
  const zoho = useZoho();
  const zohoFeat = useFeature("zoho").state;
  const emailFeat = useFeature("email_send").state;
  const waFeat = useFeature("whatsapp").state;
  const signedIn = cloud.status === "signed_in";

  const facts: SetupFacts = {
    role,
    zohoOffered: zohoFeat === "available" || zohoFeat === "needs_connection",
    zohoConnected: zoho.status ? zoho.status.connected && !zoho.status.needs_reconnect : null,
    audioChecked: prefs.audioChecked,
    playbookEntries: signedIn ? (cloud.bundle?.playbook.length ?? 0) : 0,
    seatsUsed: signedIn ? (cloud.me.company?.seats_used ?? 0) : 0,
    messagingConnected: emailFeat === "available" || waFeat === "available",
    practiceOffered: signedIn && practiceScenario(cloud.bundle) !== null,
    markedDone: prefs.setupDone,
  };

  return <SetupGuideView facts={facts} />;
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: space.sm,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    flexWrap: "wrap",
  },
});
