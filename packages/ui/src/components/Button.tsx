import type { ReactNode } from "react";
import { Pressable, type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import { useTheme } from "../theme.tsx";
import { type Hex, minTouchTarget, radius, size, space } from "../tokens.ts";
import { useFocusRing } from "./focus.ts";
import { Text } from "./Text.tsx";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /**
   * "lg" for the one main action of an agent screen; "md" elsewhere. Both are pills ≥ 44 pt
   * (the reference's 36 px pill is kept for pointer-only HTML pages, DESIGN-SYSTEM §4.1).
   */
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
    // One primary per view (D-041). Secondary is the reference's neutral chip: flat gray, no border.
    primary: { fill: color.primary, text: color.onPrimary, border: color.primary },
    secondary: { fill: color.surfaceSunken, text: color.text, border: color.surfaceSunken },
    // UI-006: the gray chip vanishes on a sunken (gray) panel; there the second-level action is
    // a surface pill with the strong edge (≥ 3:1 on sunken, tokens.test.ts).
    outline: { fill: color.surface, text: color.text, border: color.borderStrong },
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
      style={(state) => [
        styles.base,
        size === "lg" ? styles.lg : null,
        { backgroundColor: p.fill, borderColor: p.border },
        isHovered(state) && !disabled
          ? variant === "secondary" || variant === "ghost"
            ? { backgroundColor: color.bubble, borderColor: color.bubble }
            : variant === "outline"
              ? { backgroundColor: color.bubble }
              : styles.hovered
          : null,
        state.pressed ? styles.pressed : null,
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
      <Text
        variant={size === "lg" ? "body" : "secondary"}
        weight="medium"
        color={p.text}
        numberOfLines={1}
      >
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

/** react-native-web passes `hovered` to the style callback; native never does. */
export function isHovered(state: object): boolean {
  return (state as { hovered?: boolean }).hovered === true;
}

const styles = StyleSheet.create({
  base: {
    minHeight: minTouchTarget,
    minWidth: minTouchTarget,
    paddingHorizontal: space.lg + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  lg: { minHeight: size.controlLg, paddingHorizontal: space.xl },
  hovered: { opacity: 0.92 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.45 },
  withHelper: { gap: space.xs, alignItems: "flex-start" },
});
