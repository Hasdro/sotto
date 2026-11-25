/**
 * Role-aware Setup Guide (L2):
 * Steps in plain words with "what this does", recommended defaults, live status
 * ("Zoho: connected ✓", "WhatsApp / Email: not set up → Fix it"), and "Test it" checks.
 */
import { Badge, Button, radius, Stack, space, Text, useTheme } from "@sotto/ui";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFeature } from "../../components/FeatureGate";
import { SafeBoundary } from "../../components/SafeBoundary";
import { practiceScenario } from "../../features/call/practice";
import { useZoho } from "../../features/crm/useZoho";
import { guideStepsFor, type SetupFacts, type SetupStep } from "../../features/home/setup";
import { usePrefs } from "../../lib/prefs";
import { useRole } from "../../lib/role";
import { useCloud } from "../../lib/useCloud";

export type StepTester = (
  step: SetupStep,
  facts: SetupFacts,
) => Promise<{ ok: boolean; detail: string }>;

const defaultTester: StepTester = async (step, facts) => {
  const ok = step.done(facts);
  return {
    ok,
    detail: ok
      ? `${(step.statusLine ? step.statusLine(facts) : step.id)} (verified)`
      : `${(step.statusLine ? step.statusLine(facts) : step.id)} — open Fix it to complete.`,
  };
};

export default function AdminSetupScreen() {
  const cloud = useCloud();
  const { role } = useRole();
  const prefs = usePrefs();
  const zoho = useZoho();
  const zohoFeature = useFeature("zoho").state;
  const email = useFeature("email_send").state;
  const whatsapp = useFeature("whatsapp").state;
  const signedIn = cloud.status === "signed_in";

  const facts: SetupFacts = {
    role,
    zohoOffered: zohoFeature === "available" || zohoFeature === "needs_connection",
    zohoConnected: zoho.status ? zoho.status.connected && !zoho.status.needs_reconnect : false,
    audioChecked: prefs.audioChecked,
    playbookEntries: signedIn ? (cloud.bundle?.playbook.length ?? 0) : 0,
    seatsUsed: signedIn ? (cloud.me.company?.seats_used ?? 0) : 0,
    messagingConnected: email === "available" || whatsapp === "available",
    practiceOffered: signedIn && practiceScenario(cloud.bundle) !== null,
    markedDone: prefs.setupDone,
  };

  return (
    <SafeBoundary name="admin.setup">
      <SetupGuideView facts={facts} />
    </SafeBoundary>
  );
}

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
          Setup guide ({facts.role})
        </Text>
        <Text variant="body" color={color.textMuted}>
          Check each step below, run a quick test, or jump straight to Fix it.
        </Text>
      </Stack>

      {steps.map((step) => {
        const ok = results[step.id]?.ok ?? step.done(facts);
        const statusText = results[step.id]?.detail ?? (step.statusLine ? step.statusLine(facts) : step.id);
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
              <Text variant="body">{step.whatItDoes ?? ''}</Text>
              <Text variant="label" color={color.textMuted}>
                Recommended default: {step.recommendedDefault ?? ''}
              </Text>
              <View style={styles.actions}>
                <Button
                  variant="secondary"
                  label={testingId === step.id ? "Testing…" : "Test it"}
                  onPress={() => void runTest(step)}
                  disabled={testingId === step.id}
                  testID={`setup-guide-test-${step.id}`}
                />
                {!ok ? (
                  <Button
                    variant="primary"
                    label="Fix it"
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

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
});
