/**
 * UI-008: the review's chance to close on a History row and its hover card, with its name on it
 * ("20% to close"); a bare red bar and "20%" read like upload progress or an error rate. The
 * colour stays on the bar (green ≥ 70, amber ≥ 40, red below, the review's bands); the words use
 * a text colour, because card accents only reach 3:1 on the page (tokens.test.ts).
 */
import { radius, space, Text, useTheme } from "@sotto/ui";
import { StyleSheet, View } from "react-native";
import { useI18n } from "../../lib/locale";

export function ChanceMeter({ success, testID }: { success: number; testID?: string }) {
  const { t } = useI18n();
  const { color, card } = useTheme();
  const n = Math.round(Math.min(100, Math.max(0, success)));
  const fill = n >= 70 ? card.answer.accent : n >= 40 ? card.objection.accent : card.warning.accent;
  return (
    <View
      style={styles.row}
      testID={testID}
      accessible
      accessibilityLabel={t("history.chance", { n })}
    >
      <View style={[styles.track, { backgroundColor: color.surfaceSunken }]}>
        <View style={[styles.fill, { width: `${n}%`, backgroundColor: fill }]} />
      </View>
      <Text variant="label" tone="muted" numberOfLines={1}>
        {t("history.chanceShort", { n })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.xs },
  track: { width: 40, height: 6, borderRadius: radius.pill, overflow: "hidden" },
  fill: { height: 6, borderRadius: radius.pill },
});
