import { StyleSheet, Switch, View } from "react-native";
import { useTheme } from "../theme.tsx";
import { minTouchTarget, space } from "../tokens.ts";
import { Text } from "./Text.tsx";

export type ToggleRowProps = {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID?: string;
};

/** A setting with an on/off switch. The whole row is one labelled control. */
export function ToggleRow({ label, description, value, onValueChange, testID }: ToggleRowProps) {
  const { color } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text variant="body" weight="medium">
          {label}
        </Text>
        {description ? (
          <Text variant="label" tone="muted">
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        testID={testID}
        accessibilityLabel={label}
        accessibilityHint={description}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: color.borderStrong, true: color.primary }}
        thumbColor={color.surface}
        ios_backgroundColor={color.borderStrong}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
    minHeight: minTouchTarget + space.md,
    paddingVertical: space.sm,
  },
  text: { flex: 1, gap: 2 },
});
