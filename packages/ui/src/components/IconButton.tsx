/**
 * An icon-only button (UX-44a): always a 44 pt target, always an accessible name, and a visible
 * focus ring. The icon itself is decorative; `label` is what assistive tech reads.
 */
import { Pressable, type StyleProp, StyleSheet, type ViewStyle } from "react-native";
import { useTheme } from "../theme.tsx";
import { type Hex, minTouchTarget, radius } from "../tokens.ts";
import { isHovered } from "./Button.tsx";
import { useFocusRing } from "./focus.ts";
import { Icon, type IconName } from "./Icon.tsx";

export type IconButtonProps = {
  icon: IconName;
  /** Accessible name, e.g. "Helpful". Required: the button has no visible text. */
  label: string;
  onPress?: (() => void) | undefined;
  /** A toggle that is on (e.g. a chosen rating). */
  selected?: boolean | undefined;
  disabled?: boolean | undefined;
  /** Draw a hairline border (toolbar style) instead of a bare glyph. */
  outlined?: boolean | undefined;
  iconSize?: number | undefined;
  color?: Hex | undefined;
  accessibilityHint?: string | undefined;
  onFocus?: (() => void) | undefined;
  onBlur?: (() => void) | undefined;
  testID?: string | undefined;
  style?: StyleProp<ViewStyle> | undefined;
};

export function IconButton({
  icon,
  label,
  onPress,
  selected,
  disabled = false,
  outlined = false,
  iconSize = 20,
  color: ink,
  accessibilityHint,
  onFocus,
  onBlur,
  testID,
  style,
}: IconButtonProps) {
  const { color } = useTheme();
  const focus = useFocusRing({ onFocus, onBlur });
  const on = selected === true;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected: on }) }}
      aria-pressed={selected === undefined ? undefined : on}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      style={(state) => [
        styles.base,
        // Reference: a gray circle behind the glyph on hover and when on; the glyph keeps its colour.
        isHovered(state) && !disabled ? { backgroundColor: color.surfaceSunken } : null,
        outlined ? { borderWidth: 1, borderColor: color.borderStrong } : null,
        on ? { borderWidth: 1, borderColor: color.primary, backgroundColor: color.bubble } : null,
        state.pressed ? styles.pressed : null,
        disabled ? styles.disabled : null,
        focus.ring,
        style,
      ]}
    >
      <Icon name={icon} size={iconSize} color={ink ?? (on ? color.primary : color.text)} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },
});
