import type { Href } from "expo-router";
import { Platform } from "react-native";

/**
 * `/settings#zoho`: bring that section into view after navigating, also when the page is already
 * open (its own on-mount scroll then never runs). Web only; elsewhere the page opens at the top.
 */
export function scrollToAnchor(href: Href): void {
  const id = String(href).split("#")[1];
  if (!id || Platform.OS !== "web") return;
  setTimeout(() => {
    (globalThis as { document?: Document }).document
      ?.getElementById(id)
      ?.scrollIntoView?.({ block: "start" });
  }, 350);
}
