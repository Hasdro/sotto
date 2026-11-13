/**
 * One number with its label (UX-23/UX-26 enabler). Neutral: surface fill and a hairline, no
 * status colour, so a row of tiles never competes with the one loud thing on an agent screen.
 * Read as one sentence by screen readers; not focusable.
 */
import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme.tsx";
import { radius, space } from "../tokens.ts";
import { Text } from "./Text.tsx";

export type StatTileProps = {
  label: string;
  value: string;
  /** One quiet line under the value, e.g. "3 more than last week". */
  hint?: string | undefined;
  testID?: string | undefined;
};

export function StatTile({ label, value, hint, testID }: StatTileProps) {
  const { color } = useTheme();
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`${label}: ${value}${hint ? `. ${hint}` : ""}`}
      style={[styles.tile, { backgroundColor: color.surface, borderColor: color.border }]}
    >
      <Text variant="label" weight="medium" tone="muted" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="title" weight="semibold">
        {value}
      </Text>
      {hint ? (
        <Text variant="label" tone="muted" numberOfLines={2}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexGrow: 1,
    flexBasis: 160,
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingVertical: space.lg,
    paddingHorizontal: space.xl,
    gap: space.xs,
  },
});
