/**
 * Keyboard focus ring (UX-44a, WCAG 2.4.7): an outline in the `focus` token while a control has
 * focus. An outline takes no layout space, so focusing never moves anything.
 */
import { useState } from "react";
import type { ViewStyle } from "react-native";
import { useTheme } from "../theme.tsx";
import { size } from "../tokens.ts";

export function useFocusRing(
  handlers: { onFocus?: (() => void) | undefined; onBlur?: (() => void) | undefined } = {},
): {
  focused: boolean;
  ring: ViewStyle | null;
  onFocus: () => void;
  onBlur: () => void;
} {
  const { color } = useTheme();
  const [focused, setFocused] = useState(false);
  return {
    focused,
    ring: focused
      ? {
          outlineColor: color.focus,
          outlineStyle: "solid",
          outlineWidth: size.focusRing,
          outlineOffset: size.focusOffset,
        }
      : null,
    onFocus: () => {
      setFocused(true);
      handlers.onFocus?.();
    },
    onBlur: () => {
      setFocused(false);
      handlers.onBlur?.();
    },
  };
}

/** Web keydown on a control: Enter or Space activates it. Returns true when handled. */
export function isActivationKey(key: string | undefined): boolean {
  return key === "Enter" || key === " " || key === "Spacebar";
}

/** The key of a keydown event from react-native-web (or a test). */
export function keyOf(e: unknown): string | undefined {
  const ev = e as { key?: string; nativeEvent?: { key?: string } };
  return ev.nativeEvent?.key ?? ev.key;
}
