import { Button, Mascot, Panel, radius, space, Text, useTheme } from "@sotto/ui";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { cloudOrigin } from "../../../lib/cloud";
import { useI18n } from "../../../lib/locale";
import { usePrefs } from "../../../lib/prefs";
import { useIsWide } from "../../../lib/responsive";
import type { AudioSource } from "../mic";

type Props = {
  /** The desktop app can hear the computer's sound (Zoom, Google Meet, softphones). */
  computer: boolean;
  onStart: (source: AudioSource) => void;
};

/**
 * Before a real call (owner, 21 Oct): no source cards. Sotto waits for the call app to start and
 * starts by itself (auto pick-up, desktop); Start now begins at once. The computer's sound is the
 * default on the desktop (exact, R4); the microphone stays one tap away for in-person calls.
 */
export function ListenStart({ computer, onStart }: Props) {
  const { t } = useI18n();
  const { color, card } = useTheme();
  const wide = useIsWide();
  const { autoPickup } = usePrefs();
  const watching = computer && autoPickup;
  return (
    <Panel style={[styles.panel, wide ? null : styles.panelNarrow]} testID="listen-start">
      <View style={styles.head}>
        <Mascot state={watching ? "listening" : "idle"} size={64} />
        <View style={styles.headText}>
          <Text variant="title" weight="semibold" accessibilityRole="header">
            {t(watching ? "call.wait.title" : "call.listen.title")}
          </Text>
          <Text variant="body" tone="muted">
            {t(watching ? "call.wait.body" : "call.listen.body")}
          </Text>
        </View>
      </View>
      {watching ? (
        <View style={[styles.watch, { backgroundColor: card.answer.fill }]}>
          <View style={[styles.liveDot, { backgroundColor: card.answer.accent }]} />
          <Text variant="label" weight="medium" color={card.answer.text}>
            {t("call.wait.apps")}
          </Text>
        </View>
      ) : null}
      <View style={[styles.actions, wide ? null : styles.actionsNarrow]}>
        <Button
          size="lg"
          label={t("call.wait.start")}
          onPress={() => onStart(computer ? "computer" : "mic")}
          testID="start-call"
        />
        {computer ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onStart("mic")}
            testID="source-mic"
            style={styles.link}
          >
            <Text variant="label" weight="medium" color={color.primary}>
              {t("call.wait.mic")}
            </Text>
          </Pressable>
        ) : null}
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
export function PhoneCallsLater() {
  const { t } = useI18n();
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
    </Panel>
  );
}
