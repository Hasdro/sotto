import type { ReactNode } from "react";
import { Pressable, type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import { useTheme } from "../theme.tsx";
import { type Hex, minTouchTarget, radius, size, space } from "../tokens.ts";
import { useFocusRing } from "./focus.ts";
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
  /** Shown under a disabled button to say why it is disabled, e.g. "Enter a client ID first". */
  helper?: string;
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
  helper,
  testID,
  style,
}: ButtonProps) {
  const { color } = useTheme();
  const focus = useFocusRing();
  const why = disabled && helper ? helper : undefined;
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
  const button = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={why ?? accessibilityHint}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      style={({ pressed }) => [
        styles.base,
        size === "lg" ? styles.lg : null,
        { backgroundColor: p.fill, borderColor: p.border },
        pressed ? styles.pressed : null,
        disabled ? styles.disabled : null,
        focus.ring,
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
  if (!why) return button;
  return (
    <View style={styles.withHelper}>
      {button}
      <Text variant="label" tone="muted">
        {why}
      </Text>
    </View>
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
  lg: { minHeight: size.controlLg, paddingHorizontal: space.xl },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },
  withHelper: { gap: space.xs, alignItems: "flex-start" },
});
