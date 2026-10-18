/**
 * Theme and direction context for packages/ui components.
 *
 * Without a provider the components follow the device (useColorScheme) and LTR. The app wraps
 * the tree in <UIProvider> so a settings toggle or the gallery can force a scheme or direction.
 */
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";
import { type Theme, type ThemeName, themes } from "./tokens.ts";

export type Direction = "ltr" | "rtl";

type UIContextValue = { scheme: ThemeName | null; direction: Direction };

const UIContext = createContext<UIContextValue>({ scheme: null, direction: "ltr" });

export function UIProvider({
  scheme = null,
  direction = "ltr",
  children,
}: {
  /** null follows the device setting. */
  scheme?: ThemeName | null;
  direction?: Direction;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ scheme, direction }), [scheme, direction]);
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

/** The active scheme name: the provider's override, else the device setting (light if unknown). */
export function useScheme(): ThemeName {
  const device = useColorScheme();
  const { scheme } = useContext(UIContext);
  return scheme ?? (device === "dark" ? "dark" : "light");
}

/** The active token set. */
export function useTheme(): Theme {
  return themes[useScheme()];
}

export function useDirection(): Direction {
  return useContext(UIContext).direction;
}
