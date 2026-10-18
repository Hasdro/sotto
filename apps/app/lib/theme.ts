import { type Theme, themes } from "@sotto/ui";
import { useColorScheme } from "react-native";

/** The active token set for the device's light/dark setting. */
export function useTheme(): Theme {
  return useColorScheme() === "dark" ? themes.dark : themes.light;
}
