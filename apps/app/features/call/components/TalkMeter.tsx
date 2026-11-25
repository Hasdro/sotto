/**
 * Live talk-time share meter (C8): compact bar showing the agent's share of talk time.
 * Shown only when customer and agent are separate tracks; hidden in approximate (voice-sample)
 * mode or before any speech is measured. Designed to fit R8 live-screen density.
 */
import { radius, space, Text, useTheme } from "@sotto/ui";
import { StyleSheet, View } from "react-native";
import { useI18n } from "../../../lib/locale";

const COPY = {
  en: { label: "Your talk time" },
  ar: { label: "نسبة حديثك" },
} as const;

export function agentTalkShare(agentMs: number, customerMs: number): number | null {
  const a = Math.max(0, agentMs);
  const c = Math.max(0, customerMs);
  const total = a + c;
  if (total <= 0) return null;
  return Math.round((a / total) * 100);
}

export function TalkMeter({
  agentMs,
  customerMs,
  approximate,
}: {
  agentMs: number;
  customerMs: number;
  /** True when running on a single mic / approximate voice-sample mode (C8: must hide). */
  approximate: boolean;
}) {
  const { locale } = useI18n();
  const { color } = useTheme();
  if (approximate) return null;
  const pct = agentTalkShare(agentMs, customerMs);
  if (pct === null) return null;

  const label = COPY[locale].label;
  // Gentle visual warning when agent dominates > 65% of talk time.
  const barColor = pct > 65 ? color.warning : color.primary;

  return (
    <View
      testID="talk-meter"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${label}: ${pct}%`}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={styles.wrap}
    >
      <View style={styles.head}>
        <Text variant="label" tone="muted">
          {label}
        </Text>
        <Text variant="label" weight="medium" testID="talk-meter-pct">
          {pct}%
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: color.surfaceSunken }]}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  track: { height: 6, borderRadius: radius.pill, overflow: "hidden" },
  fill: { height: 6, borderRadius: radius.pill },
});
