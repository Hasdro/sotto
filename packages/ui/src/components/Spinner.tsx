import { ActivityIndicator } from "react-native";
import { useTheme } from "../theme.tsx";
import type { Hex } from "../tokens.ts";

/**
 * A small activity spinner in a theme colour (UX-004). Decorative: the words beside it, or the
 * busy button it sits in, say what is happening.
 */
export function Spinner({
  color,
  size = "small",
  testID,
}: {
  color?: Hex;
  size?: "small" | "large";
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <ActivityIndicator
      size={size}
      color={color ?? theme.color.textMuted}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      testID={testID}
    />
  );
}
