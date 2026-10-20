import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../theme.tsx";
import { minTouchTarget, radius, space } from "../tokens.ts";
import { Text } from "./Text.tsx";

export type SegmentedOption<V extends string> = { value: V; label: string };

export type SegmentedControlProps<V extends string> = {
  options: readonly SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
  /** Accessible name of the group. */
  accessibilityLabel: string;
  testID?: string;
};

/** A small exclusive choice (2–4 options), e.g. who is speaking or the app language. */
export function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  testID,
}: SegmentedControlProps<V>) {
  const { color } = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, { backgroundColor: color.surfaceSunken, borderColor: color.border }]}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            aria-checked={selected}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            testID={testID ? `${testID}-${o.value}` : undefined}
            style={[
              styles.item,
              selected
                ? { backgroundColor: color.surface, borderColor: color.borderStrong }
                : { borderColor: "transparent" },
            ]}
          >
            <Text
              variant="label"
              weight={selected ? "semibold" : "medium"}
              tone={selected ? "default" : "muted"}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 2,
    gap: 2,
    alignSelf: "flex-start",
  },
  item: {
    minHeight: minTouchTarget - 4,
    minWidth: minTouchTarget,
    paddingHorizontal: space.md,
    borderRadius: radius.md - 2,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
