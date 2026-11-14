/**
 * The first-run checklist on Home (UX-10): this role's steps still to do, each with an Open
 * button to the page that does it. Ticking a step marks it done by hand (it leaves the list);
 * a step also leaves on its own once the app sees it done (Zoho connected, audio checked,
 * playbook answers, a second seat, email or WhatsApp connected). Hidden when nothing is left.
 */
import { Button, ChecklistRow, radius, space, Text, useTheme } from "@sotto/ui";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useFeature } from "../../components/FeatureGate";
import { useI18n } from "../../lib/locale";
import { setPrefs, usePrefs } from "../../lib/prefs";
import { useRole } from "../../lib/role";
import { useCloud } from "../../lib/useCloud";
import { practiceScenario } from "../call/practice";
import { useZoho } from "../crm/useZoho";
import { type SetupFacts, type SetupStep, setupFor } from "./setup";
import { isHomeKey, useHomeText } from "./strings";

export function SetupChecklist() {
  const cloud = useCloud();
  const { role } = useRole();
  if (cloud.status !== "signed_in") return null;
  return role === "agent" ? <AgentChecklist /> : <StaffChecklist />;
}

/** Agents: the Zoho status is read (and re-read when the window comes back) by useZoho. */
function AgentChecklist() {
  const zoho = useZoho();
  const offered = useFeature("zoho").state;
  const facts = useFacts();
  return (
    <Checklist
      facts={{
        ...facts,
        zohoOffered: offered === "available" || offered === "needs_connection",
        zohoConnected: zoho.status ? zoho.status.connected && !zoho.status.needs_reconnect : null,
      }}
    />
  );
}

function StaffChecklist() {
  const email = useFeature("email_send").state;
  const whatsapp = useFeature("whatsapp").state;
  const facts = useFacts();
  return (
    <Checklist
      facts={{ ...facts, messagingConnected: email === "available" || whatsapp === "available" }}
    />
  );
}

function useFacts(): SetupFacts {
  const cloud = useCloud();
  const { role } = useRole();
  const p = usePrefs();
  const signedIn = cloud.status === "signed_in";
  return {
    role,
    zohoConnected: null,
    zohoOffered: false,
    audioChecked: p.audioChecked,
    playbookEntries: signedIn ? (cloud.bundle?.playbook.length ?? 0) : 0,
    seatsUsed: signedIn ? (cloud.me.company?.seats_used ?? 0) : 0,
    messagingConnected: false,
    practiceOffered: signedIn && practiceScenario(cloud.bundle) !== null,
    markedDone: p.setupDone,
  };
}

function Checklist({ facts }: { facts: SetupFacts }) {
  const { t } = useI18n();
  const th = useHomeText();
  const labelOf = (step: SetupStep) => (isHomeKey(step.label) ? th(step.label) : t(step.label));
  const { color } = useTheme();
  const { pending, total } = setupFor(facts);
  if (pending.length === 0) return null;
  return (
    <View
      testID="home-setup"
      // A flat well (D-041): first-run steps sit apart from the outlined cards, no border.
      style={[styles.box, { backgroundColor: color.surfaceSunken }]}
    >
      <View style={styles.head}>
        <Text variant="heading" weight="semibold" accessibilityRole="header">
          {t("setup.title")}
        </Text>
        <Text variant="label" tone="muted">
          {t("setup.progress", { done: total - pending.length, total })}
        </Text>
      </View>
      {pending.map((step) => (
        <View key={step.id} style={styles.row}>
          <View style={styles.grow}>
            <ChecklistRow
              checked={false}
              label={labelOf(step)}
              onToggle={() => setPrefs({ setupDone: [...facts.markedDone, step.id] })}
              testID={`setup-${step.id}`}
            />
          </View>
          <Button
            variant="secondary"
            label={t("setup.open")}
            accessibilityHint={labelOf(step)}
            onPress={() => router.push(step.href)}
            testID={`setup-${step.id}-open`}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    padding: space.xl,
    gap: space.sm,
    borderRadius: radius.xl,
  },
  head: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.md,
    flexWrap: "wrap",
  },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  grow: { flex: 1, minWidth: 0 },
});
