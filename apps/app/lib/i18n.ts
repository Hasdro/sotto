/**
 * Minimal string table so screens never hard-code text (ENGINEERING §11).
 * Phase 3 replaces this with the real i18n setup, including RTL switching for Arabic.
 */
const en = {
  "home.title": "Sotto",
  "home.subtitle": "Your live sales-call copilot.",
} as const;

export type StringKey = keyof typeof en;

const ar: Record<StringKey, string> = {
  "home.title": "سوتو",
  "home.subtitle": "مساعدك المباشر في مكالمات المبيعات.",
};

const tables = { en, ar } as const;
export type Locale = keyof typeof tables;

export function t(key: StringKey, locale: Locale = "en"): string {
  return tables[locale][key];
}
