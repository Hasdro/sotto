import type { Locale } from "./i18n";

const tag = (locale: Locale) => (locale === "ar" ? "ar-AE" : "en-GB");

/** "18 Oct, 10:12" style date-time for lists. Western digits in both languages (DESIGN.md §8). */
export function formatDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(tag(locale), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    numberingSystem: "latn",
    timeZone: "Asia/Dubai",
  }).format(new Date(iso));
}

export function formatDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(tag(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    numberingSystem: "latn",
    timeZone: "Asia/Dubai",
  }).format(new Date(iso));
}
