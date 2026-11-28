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
  /** Dimmed and not pressable (e.g. while a change is saving); the choice stays readable. */
  disabled?: boolean;
  testID?: string;
};

/** A small exclusive choice (2–4 options), e.g. who is speaking or the app language. */
export function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  disabled = false,
  testID,
}: SegmentedControlProps<V>) {
  const { color } = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      aria-disabled={disabled}
      style={[
        styles.track,
        { backgroundColor: color.surfaceSunken, borderColor: color.border },
        disabled ? styles.disabled : null,
      ]}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            aria-checked={selected}
            aria-disabled={disabled}
            disabled={disabled}
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
              style={styles.label}
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
    borderRadius: radius.pill,
    borderWidth: 1,
    padding: 2,
    gap: 2,
    alignSelf: "flex-start",
    // On a narrow phone the options shrink and wrap their labels instead of being clipped.
    maxWidth: "100%",
  },
  item: {
    minHeight: minTouchTarget - 4,
    minWidth: minTouchTarget,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 1,
  },
  label: { textAlign: "center" },
  disabled: { opacity: 0.45 },
});
