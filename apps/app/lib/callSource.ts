/**
 * Where a call came from (owner, 22 Oct): Zoom, Teams, Google Meet, 3CX, Yeastar… or the
 * microphone. Auto pick-up names the call app; a call started by hand is "computer" or "mic".
 * Shown as an icon and a name on the call screen and in History, and reported with the call's
 * numbers for Reports.
 */
import type { IconName } from "@sotto/ui";
import type { Locale } from "./i18n";
import { useSyncExternalStore } from "react";

export type CallSource =
  | "zoom"
  | "teams"
  | "meet"
  | "webex"
  | "3cx"
  | "yeastar"
  | "whatsapp"
  | "facetime"
  | "slack"
  | "telegram"
  | "discord"
  | "softphone"
  | "browser"
  | "computer"
  | "mic"
  | "practice";

/** Sotto's own icon plus the product's name (owner, 22 Oct: no emoji, a designed icon set). */
export const SOURCE_META: Record<CallSource, { icon: IconName; name: string }> = {
  zoom: { icon: "video", name: "Zoom" },
  teams: { icon: "users", name: "Microsoft Teams" },
  meet: { icon: "globe", name: "Google Meet" },
  webex: { icon: "globe", name: "Webex" },
  "3cx": { icon: "phone", name: "3CX" },
  yeastar: { icon: "phone", name: "Yeastar" },
  whatsapp: { icon: "message", name: "WhatsApp" },
  facetime: { icon: "phone", name: "FaceTime" },
  slack: { icon: "message", name: "Slack" },
  telegram: { icon: "message", name: "Telegram" },
  discord: { icon: "headphones", name: "Discord" },
  softphone: { icon: "phone", name: "Softphone" },
  browser: { icon: "globe", name: "Web call" },
  computer: { icon: "screen", name: "Computer sound" },
  mic: { icon: "mic", name: "Microphone" },
  practice: { icon: "spark", name: "Practice" },
};

/**
 * The source names that are words, not brands, in Arabic. Brand names (Zoom, WhatsApp, …)
 * stay Latin in both languages, as everywhere else in the app; the four word names use the
 * same Arabic the app already uses for them ("تدريب" is `call.practice` in
 * `features/call/strings.ts`; "الميكروفون" / "صوت الكمبيوتر" are `settings.microphone` /
 * `settings.health.computer` in `lib/i18n.ts`). This is what the call header's SourceChip
 * showed in English on Arabic calls.
 */
const SOURCE_NAME_AR: Partial<Record<CallSource, string>> = {
  browser: "مكالمة ويب",
  computer: "صوت الكمبيوتر",
  mic: "الميكروفون",
  practice: "تدريب",
};

/** The name to show for a source in the given locale (brand names unchanged). */
export function sourceName(source: CallSource, locale: Locale): string {
  if (locale === "ar") return SOURCE_NAME_AR[source] ?? SOURCE_META[source].name;
  return SOURCE_META[source].name;
}

const RULES: [RegExp, CallSource][] = [
  [/zoom/, "zoom"],
  [/teams/, "teams"],
  [/webex|cisco/, "webex"],
  [/3cx/, "3cx"],
  [/yeastar|linkus/, "yeastar"],
  [/whatsapp/, "whatsapp"],
  [/facetime/, "facetime"],
  [/slack/, "slack"],
  [/telegram/, "telegram"],
  [/discord/, "discord"],
  [/zoiper|bria|counterpath|microsip|groundwire/, "softphone"],
  // Google Meet and web softphones run in a browser; Meet is by far the most common. Windows
  // process names arrive too (msedge.exe, brave.exe, …), so match those as well.
  [
    /chrome|safari|webkit|firefox|edgemac|msedge|edge|thebrowser|brave|opera|vivaldi|arc/,
    "browser",
  ],
];

/** The call source for a macOS bundle id reported by the call watcher. */
export function sourceOf(bundleId: string): CallSource {
  const id = bundleId.toLowerCase();
  return RULES.find(([re]) => re.test(id))?.[1] ?? "computer";
}

export function isCallSource(v: unknown): v is CallSource {
  return typeof v === "string" && v in SOURCE_META;
}

// The source of the call now starting or running; read when the call ends.
let current: CallSource | null = null;
const listeners = new Set<() => void>();

export function setCallSource(source: CallSource | null): void {
  if (source === current) return;
  current = source;
  for (const fn of listeners) fn();
}

export function callSource(): CallSource | null {
  return current;
}

export function useCallSource(): CallSource | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
    () => current,
  );
}
