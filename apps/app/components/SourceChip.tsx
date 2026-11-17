/** Where a call came from, as Sotto's icon and a name (owner, 22 Oct): Zoom, Yeastar, Microphone. */
import { Icon, radius, space, Text, useTheme } from "@sotto/ui";
import { StyleSheet, View } from "react-native";
import { type CallSource, SOURCE_META, sourceName } from "../lib/callSource";
import { useI18n } from "../lib/locale";

export function SourceChip({ source, compact = false }: { source: CallSource; compact?: boolean }) {
  const { color } = useTheme();
  const { locale } = useI18n();
  const meta = SOURCE_META[source];
  // The name is localised: "Practice" showed in English on the Arabic call header (T-091).
  const name = sourceName(source, locale);
  return (
    <View
      testID={`source-${source}`}
      accessibilityLabel={name}
      style={[
        styles.chip,
        { backgroundColor: color.surfaceSunken, borderColor: color.border },
        compact ? styles.compact : null,
      ]}
    >
      <Icon name={meta.icon} size={16} color={color.textMuted} />
      {compact ? null : (
        <Text variant="label" weight="medium" numberOfLines={1}>
          {name}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  compact: { paddingHorizontal: space.xs },
});
