import { Button, Mascot, Panel, radius, space, Text, useTheme } from "@sotto/ui";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { cloudOrigin } from "../../../lib/cloud";
import { useI18n } from "../../../lib/locale";
import { usePrefs } from "../../../lib/prefs";
import { useIsWide } from "../../../lib/responsive";
import { callAppName } from "../callApp";
import type { AudioSource } from "../mic";
import { useCallText } from "../strings";

type Props = {
  /** The desktop app can hear the computer's sound (Zoom, Google Meet, softphones). */
  computer: boolean;
  /** The call app the desktop app sees on the microphone now (bundle id / process), if any. */
  callApp?: string | null;
  onStart: (source: AudioSource) => void;
  /** ZC-08: open the 5-second level check. */
  onCheck?: () => void;
  /** D-073: open the practice call (only when the bundle has the script). */
  onPractice?: (() => void) | undefined;
};

/** What the start screen offers, given what the app can hear and sees. Pure (UX-20). */
export function startPlan(
  computer: boolean,
  callApp: string | null,
): {
  primary: AudioSource;
  secondary: AudioSource | null;
  detected: boolean;
} {
  if (computer && callApp) return { primary: "computer", secondary: "mic", detected: true };
  return { primary: "mic", secondary: computer ? "computer" : null, detected: false };
}

/**
 * Before a real call (owner, 21 Oct; UX-20): one start screen, one verb ("Start listening").
 * A detected call app makes the computer's sound the primary start (exact, R4: the customer is
 * the call's sound, the agent the microphone, never one mixed track); otherwise the microphone
 * is primary and the computer's sound is one tap away. Auto pick-up still starts by itself.
 *
 * Practice (D-073, owner Q15): a quiet link to the neutral practice call, never typed lines.
 */
export function ListenStart({ computer, callApp = null, onStart, onCheck, onPractice }: Props) {
  const tc = useCallText();
  const { color, card } = useTheme();
  const wide = useIsWide();
  const { autoPickup } = usePrefs();
  const plan = startPlan(computer, callApp);
  const watching = computer && autoPickup && !plan.detected;
  const name = callAppName(callApp);
  const title = plan.detected
    ? name
      ? tc("start.detected", { app: name })
      : tc("start.detectedAny")
    : tc("start.title");
  const body = plan.detected
    ? tc("start.detectedBody")
    : computer
      ? tc("start.micBody")
      : tc("start.webBody");
  const link = (label: string, onPress: () => void, testID: string) => (
    <Pressable accessibilityRole="button" onPress={onPress} testID={testID} style={styles.link}>
      <Text variant="label" weight="medium" color={color.primary}>
        {label}
      </Text>
    </Pressable>
  );
  return (
    <Panel style={[styles.panel, wide ? null : styles.panelNarrow]} testID="listen-start">
      <View style={styles.head}>
        <Mascot state={plan.detected || watching ? "listening" : "idle"} size={64} />
        <View style={styles.headText}>
          <Text variant="title" weight="semibold" accessibilityRole="header" testID="start-title">
            {title}
          </Text>
          <Text variant="body" tone="muted">
            {body}
          </Text>
        </View>
      </View>
      {watching ? (
        <View style={[styles.watch, { backgroundColor: card.answer.fill }]}>
          <View style={[styles.liveDot, { backgroundColor: card.answer.accent }]} />
          <Text variant="label" weight="medium" color={card.answer.text}>
            {tc("start.watching")}
          </Text>
        </View>
      ) : null}
      <View style={[styles.actions, wide ? null : styles.actionsNarrow]}>
        <Button
          size="lg"
          label={tc("start.listen")}
          onPress={() => onStart(plan.primary)}
          testID="start-call"
        />
        {plan.secondary === "mic"
          ? link(tc("start.useMic"), () => onStart("mic"), "source-mic")
          : null}
        {plan.secondary === "computer"
          ? link(tc("start.useComputer"), () => onStart("computer"), "source-computer")
          : null}
        {onCheck ? link(tc("check.open"), onCheck, "check-audio-open") : null}
        {onPractice ? link(tc("practice.open"), onPractice, "practice-open") : null}
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space.lg, padding: space.xl },
  panelNarrow: { padding: space.lg },
  head: { flexDirection: "row", alignItems: "center", gap: space.lg, flexWrap: "wrap" },
  headText: { flex: 1, gap: space.xs, minWidth: 220 },
  watch: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    alignSelf: "flex-start",
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.lg },
  actionsNarrow: { flexDirection: "column", flexWrap: "nowrap", alignItems: "stretch" },
  link: { paddingVertical: space.sm },
});

/** Phones (T-036): the phone app cannot hear another app's call yet (no native capture until
 * phone calling, Phase 4), so it says so instead of offering a start that fails. */
export function PhoneCallsLater({ onPractice }: { onPractice?: (() => void) | undefined } = {}) {
  const { t } = useI18n();
  const tc = useCallText();
  const wide = useIsWide();
  const origin = cloudOrigin();
  return (
    <Panel style={[styles.panel, wide ? null : styles.panelNarrow]} testID="phone-calls-later">
      <Text variant="title" weight="semibold" accessibilityRole="header">
        {t("call.phone.title")}
      </Text>
      <Text variant="body" tone="muted">
        {t("call.phone.body")}
      </Text>
      {origin ? (
        <Button
          label={t("call.phone.download")}
          variant="secondary"
          onPress={() => void Linking.openURL(`${origin}/downloads/`)}
          testID="phone-downloads"
        />
      ) : null}
      {/* D-073: the practice call needs no call audio, so phones can try it too. */}
      {onPractice ? (
        <Button
          label={tc("practice.open")}
          variant="ghost"
          onPress={onPractice}
          testID="practice-open"
        />
      ) : null}
    </Panel>
  );
}
