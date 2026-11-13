/**
 * The glass layer (D-041): floating chrome only (top-bar pills, composer, toasts, sheets, search).
 * On web: translucent fill, backdrop blur, a faint ring and the large soft float shadow. On native
 * (and wherever blur is missing) the opaque fallback, so text never sits on an unreadable mix.
 * Content cards, list rows and bubbles never use this.
 */
import { Platform, type ViewStyle } from "react-native";
import { useTheme } from "../theme.tsx";
import { glassBlur } from "../tokens.ts";

export function useGlassStyle({ elevated = false }: { elevated?: boolean } = {}): ViewStyle {
  const { glass } = useTheme();
  if (Platform.OS !== "web") return { backgroundColor: glass.fallback };
  return {
    backgroundColor: glass.fill,
    backdropFilter: `blur(${glassBlur}px)`,
    boxShadow: `0px 0px 0px 1px ${glass.ring}, ${elevated ? glass.shadowElevated : glass.shadow}`,
  } as ViewStyle;
}
