import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme.tsx";
import { radius, space } from "../tokens.ts";
import { Text } from "./Text.tsx";

/**
 * Temporary wordmark (P3 owner action: a logo is still to come): the name set in Readex Pro
 * with a short line beneath it, because sotto voce means "under the voice".
 */
export function Wordmark({ name, compact = false }: { name: string; compact?: boolean }) {
  const { color } = useTheme();
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={name} style={styles.wrap}>
      <Text variant={compact ? "heading" : "title"} weight="semibold" tone="primary">
        {name}
      </Text>
      <View style={[styles.line, { backgroundColor: color.primary, width: compact ? 18 : 24 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "flex-start", gap: 2 },
  line: { height: 3, borderRadius: radius.pill, marginStart: space.xs / 2 },
});
