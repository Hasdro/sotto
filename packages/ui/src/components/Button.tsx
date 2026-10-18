import type { ReactNode } from "react";
import { Pressable, type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import { useTheme } from "../theme.tsx";
import { type Hex, minTouchTarget, radius, space } from "../tokens.ts";
import { Text } from "./Text.tsx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** "lg" for the one main action of an agent screen; "md" elsewhere. Both are ≥ 44 pt. */
  size?: "md" | "lg";
  disabled?: boolean;
  /** Leading visual, e.g. a dot or glyph. Decorative: hidden from screen readers. */
  leading?: ReactNode;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  leading,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: ButtonProps) {
  const { color } = useTheme();
  const palette: Record<
    ButtonVariant,
    { fill: Hex | "transparent"; text: Hex; border: Hex | "transparent" }
  > = {
    primary: { fill: color.primary, text: color.onPrimary, border: color.primary },
    secondary: { fill: color.surface, text: color.text, border: color.borderStrong },
    ghost: { fill: "transparent", text: color.primary, border: "transparent" },
    danger: { fill: color.danger, text: color.onDanger, border: color.danger },
  };
  const p = palette[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        size === "lg" ? styles.lg : null,
        { backgroundColor: p.fill, borderColor: p.border },
        pressed ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      {leading ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {leading}
        </View>
      ) : null}
      <Text variant="body" weight="medium" color={p.text} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: minTouchTarget,
    minWidth: minTouchTarget,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  lg: { minHeight: 52, paddingHorizontal: space.xl },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },
});
