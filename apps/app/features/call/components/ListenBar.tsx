import { Badge, Button, radius, size, space, Text, useTheme } from "@sotto/ui";
import { StyleSheet, View } from "react-native";
import { useI18n } from "../../../lib/locale";
import type { AudioSource } from "../mic";
import type { MicState } from "../useCallSession";

type Props = {
  state: MicState;
  source: AudioSource;
  vendor: string | null;
  partial: string | null;
  onToggle: () => void;
};

/**
 * During a real call (D-024): what Sotto is listening to, a pause button, and the words heard so
 * far. No typing: lines come only from the customer's audio. The microphone shows the R4
 * "approximate" badge, because it can also hear the agent.
 */
export function ListenBar({ state, source, vendor, partial, onToggle }: Props) {
  const { t } = useI18n();
  const { color } = useTheme();
  const on = state === "on" || state === "starting";
  const problem = state === "denied" || state === "unsupported";
  const status = problem
    ? t(
        source === "computer"
          ? state === "denied"
            ? "call.listen.computerDenied"
            : "call.listen.computerUnsupported"
          : state === "denied"
            ? "call.mic.denied"
            : "call.mic.unsupported",
      )
    : state === "starting"
      ? t("call.listen.starting")
      : on
        ? t(source === "computer" ? "call.listen.onComputer" : "call.listen.onMic", {
            vendor: vendor ?? "",
          })
        : t("call.listen.paused");
  return (
    <View
      style={[styles.wrap, { borderTopColor: color.border, backgroundColor: color.surface }]}
      testID="listen-bar"
    >
      {partial ? (
        <Text
          variant="label"
          tone="muted"
          numberOfLines={2}
          testID="partial"
          accessibilityLiveRegion="polite"
        >
          {t("call.hearing", { text: partial })}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Button
          label={t(on ? "call.listen.pause" : "call.listen.resume")}
          variant={on ? "secondary" : "primary"}
          onPress={onToggle}
          testID="mic-toggle"
          leading={
            <View style={[styles.dot, { backgroundColor: on ? color.danger : color.onPrimary }]} />
          }
        />
        <Text variant="label" tone={problem ? "danger" : "muted"} style={styles.status}>
          {status}
        </Text>
        {source === "mic" ? (
          <Badge tone="objection" label={t("call.listen.approximate")} testID="approximate" />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, padding: space.md, borderTopWidth: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  status: { flexShrink: 1 },
  dot: { width: size.dot, height: size.dot, borderRadius: radius.pill },
});
