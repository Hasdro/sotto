import { StyleSheet, TextInput, type TextInputProps, View } from "react-native";
import { useTheme } from "../theme.tsx";
import { minTouchTarget, radius, space, type } from "../tokens.ts";
import { fontFor, Text } from "./Text.tsx";

export type TextFieldProps = Omit<TextInputProps, "style" | "placeholderTextColor"> & {
  /** Visible label above the field; also the accessible name. Omit only with accessibilityLabel. */
  label?: string;
};

export function TextField({ label, accessibilityLabel, ...rest }: TextFieldProps) {
  const { color } = useTheme();
  return (
    <View style={styles.wrap}>
      {label ? (
        <Text variant="label" weight="medium" tone="muted">
          {label}
        </Text>
      ) : null}
      <TextInput
        {...rest}
        accessibilityLabel={accessibilityLabel ?? label}
        placeholderTextColor={color.textMuted}
        style={[
          styles.input,
          type.body,
          fontFor("regular"),
          {
            color: color.text,
            backgroundColor: color.surfaceSunken,
            borderColor: color.borderStrong,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs, flexGrow: 1, flexShrink: 1 },
  input: {
    minHeight: minTouchTarget,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
});
