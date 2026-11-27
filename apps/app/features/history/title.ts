/**
 * UX-009: the name a call is listed under in History, Home and ⌘K. A call linked to a Zoho
 * record is saved under the person's (or meeting's) name (features/crm/attached.ts
 * `attachedCallName`); any other call is named by the part of the day, since its row already
 * shows the date, time and source. Calls saved before this kept "Call 11/14/2026, 9:46:45 AM"
 * (the computer's US 12-hour clock above the app's 24-hour one): those count as unnamed.
 */
import { dubaiHour } from "../../lib/format";
import type { StringKey } from "../../lib/i18n";

/** `Call ${new Date().toLocaleString()}` in any locale: "Call", then a time with seconds. */
const OLD_TITLE = /^Call .*[0-9٠-٩۰-۹]{1,2}:[0-9٠-٩۰-۹]{2}:[0-9٠-٩۰-۹]{2}/;

export function isAutoTitle(title: string | undefined): boolean {
  const text = (title ?? "").trim();
  return !text || OLD_TITLE.test(text);
}

export type DayPart = "morning" | "afternoon" | "evening" | "night";

export function dayPart(at: number | string): DayPart {
  const hour = dubaiHour(at);
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

const UNNAMED: Record<DayPart, StringKey> = {
  morning: "history.unnamed.morning",
  afternoon: "history.unnamed.afternoon",
  evening: "history.unnamed.evening",
  night: "history.unnamed.night",
};

/** The saved name, else "Morning call" / "مكالمة صباحية" from when the call started. */
export function callTitle(
  title: string | undefined,
  startedAt: number | string,
  t: (key: StringKey) => string,
): string {
  return isAutoTitle(title) ? t(UNNAMED[dayPart(startedAt)]) : (title ?? "").trim();
}
