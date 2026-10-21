/**
 * An in-app link that switches screens without reloading the app (owner, 22 Oct: "switching
 * sections is slow"). On the web build, expo-router's `<Link asChild>` around a Pressable loses
 * its click handler, so the browser followed the href and restarted the whole app on every
 * click. This keeps a real link (href, role, cmd/ctrl-click opens a new window where that works)
 * and routes inside the app for a plain click.
 */
import { type Href, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { type GestureResponderEvent, Pressable, type PressableProps } from "react-native";

type Props = Omit<PressableProps, "onPress" | "children"> & {
  href: Href;
  /** Runs before navigating, e.g. to close the menu drawer. */
  onNavigate?: () => void;
  children: ReactNode;
};

type WebEvent = GestureResponderEvent & {
  preventDefault?: () => void;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  button?: number;
};

/** True for a plain primary click: no modifier keys, not a middle click. */
export function plainClick(e: WebEvent): boolean {
  const n = (e.nativeEvent ?? {}) as Partial<WebEvent>;
  const mod = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || n.metaKey || n.ctrlKey;
  return !mod && (e.button ?? n.button ?? 0) === 0;
}

export function AppLink({ href, onNavigate, children, ...rest }: Props) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      {...rest}
      // react-native-web renders a real <a href>, so the address shows on hover and screen
      // readers announce a link; the press below keeps the click inside the app.
      {...({ href: typeof href === "string" ? href : undefined } as object)}
      onPress={(e: WebEvent) => {
        if (!plainClick(e)) return; // let the browser open it elsewhere
        e.preventDefault?.();
        onNavigate?.();
        router.navigate(href);
      }}
    >
      {children}
    </Pressable>
  );
}
