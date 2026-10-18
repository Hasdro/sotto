import { layout } from "@sotto/ui";
import { useWindowDimensions } from "react-native";

/** True from the wide breakpoint up: sidebar navigation and two-column screens (DESIGN.md §6). */
export function useIsWide(): boolean {
  return useWindowDimensions().width >= layout.wideBreakpoint;
}
