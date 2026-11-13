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

/** "10:12" — the time of day alone, for rows that show the date separately. */
export function formatTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(tag(locale), {
    hour: "2-digit",
    minute: "2-digit",
    numberingSystem: "latn",
    timeZone: "Asia/Dubai",
  }).format(new Date(iso));
}

// --- UX-17: Zoho values in the rail (amounts, dates). Pure; the call stream owns these, others
// import them read-only. Calendar days are Dubai days, like the helpers above.

const ZONE = "Asia/Dubai";

/** "12,000" — grouped Western digits in both languages. */
export function formatNumber(n: number, locale: Locale): string {
  return new Intl.NumberFormat(tag(locale), {
    numberingSystem: "latn",
    maximumFractionDigits: 2,
  }).format(n);
}

/** Zoho sends amounts as text ("12000", "12,000.50"); null when it is not a number. */
export function parseAmount(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = (raw ?? "").replace(/[,\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** "AED 12,000"; grouped digits when the currency is unknown; the raw text when not a number. */
export function formatMoney(
  raw: string | number | null | undefined,
  currency: string | null | undefined,
  locale: Locale,
): string {
  const n = parseAmount(raw);
  if (n === null) return typeof raw === "string" ? raw : "";
  if (!currency || !/^[A-Z]{3}$/.test(currency)) return formatNumber(n, locale);
  const out = new Intl.NumberFormat(tag(locale), {
    style: "currency",
    currency,
    currencyDisplay: "code",
    numberingSystem: "latn",
    maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
  }).format(n);
  return out.replace(/ /g, " ");
}

type Day = { y: number; m: number; d: number };

/** The calendar day of a Zoho value: a bare date as written, a date-time as a Dubai day. */
function dayOf(value: string | Date): Day | null {
  if (typeof value === "string") {
    const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (bare) return { y: Number(bare[1]), m: Number(bare[2]), d: Number(bare[3]) };
  }
  const at = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(at.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

const utc = (x: Day) => Date.UTC(x.y, x.m - 1, x.d);
const DAY_WORD: Record<Locale, { today: string; tomorrow: string }> = {
  en: { today: "Today", tomorrow: "Tomorrow" },
  ar: { today: "اليوم", tomorrow: "غداً" },
};

/** "Today", "Tomorrow", "1 Dec", "5 Jan 2027"; the input itself when it is not a date. */
export function formatDay(value: string, locale: Locale, now: Date = new Date()): string {
  const day = dayOf(value);
  const today = dayOf(now);
  if (!day || !today) return value;
  const diff = Math.round((utc(day) - utc(today)) / 86_400_000);
  if (diff === 0) return DAY_WORD[locale].today;
  if (diff === 1) return DAY_WORD[locale].tomorrow;
  return new Intl.DateTimeFormat(tag(locale), {
    day: "numeric",
    month: "short",
    ...(day.y === today.y ? {} : { year: "numeric" as const }),
    numberingSystem: "latn",
    timeZone: "UTC",
  }).format(new Date(utc(day)));
}

/** "Today, 13:53" / "1 Dec, 13:53"; the input itself when it is not a date-time. */
export function formatWhen(iso: string, locale: Locale, now: Date = new Date()): string {
  if (Number.isNaN(new Date(iso).getTime())) return iso;
  const sep = locale === "ar" ? "، " : ", ";
  return `${formatDay(iso, locale, now)}${sep}${formatTime(iso, locale)}`;
}
