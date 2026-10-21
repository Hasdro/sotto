/**
 * Where a call came from (owner, 22 Oct): Zoom, Teams, Google Meet, 3CX, Yeastar… or the
 * microphone. Auto pick-up names the call app; a call started by hand is "computer" or "mic".
 * Shown as an icon and a name on the call screen and in History, and reported with the call's
 * numbers for Reports.
 */
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

/** Emoji first: the owner asked for pictures over words (22 Oct). Names are product names. */
export const SOURCE_META: Record<CallSource, { icon: string; name: string }> = {
  zoom: { icon: "🎥", name: "Zoom" },
  teams: { icon: "👥", name: "Microsoft Teams" },
  meet: { icon: "🟢", name: "Google Meet" },
  webex: { icon: "🌀", name: "Webex" },
  "3cx": { icon: "☎️", name: "3CX" },
  yeastar: { icon: "📞", name: "Yeastar" },
  whatsapp: { icon: "💬", name: "WhatsApp" },
  facetime: { icon: "📱", name: "FaceTime" },
  slack: { icon: "💼", name: "Slack" },
  telegram: { icon: "✈️", name: "Telegram" },
  discord: { icon: "🎧", name: "Discord" },
  softphone: { icon: "☎️", name: "Softphone" },
  browser: { icon: "🌐", name: "Web call" },
  computer: { icon: "🔊", name: "Computer sound" },
  mic: { icon: "🎙️", name: "Microphone" },
  practice: { icon: "🧪", name: "Practice" },
};

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
  // Google Meet and web softphones run in a browser; Meet is by far the most common.
  [/chrome|safari|webkit|firefox|edgemac|thebrowser|brave|opera|vivaldi/, "browser"],
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
