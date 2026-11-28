/**
 * Home strings added by wave 3 (D-058): kept here, not in lib/i18n.ts, which another stream
 * owns this wave. English and Arabic in step (pattern of features/email/strings.ts).
 */
import type { Locale } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";

const en = {
  /** D-073: the first-run step that opens the practice call. */
  "setup.practice": "Try a practice call",
  /** UX-014: the Setup guide for every role (it said "Setup guide (admin)"). */
  "guide.title": "Setup guide",
  "guide.intro": "Check each step below, run a quick test, or jump straight to Fix it.",
  "guide.test": "Test it",
  "guide.testing": "Testing…",
  "guide.fix": "Fix it",
} as const;

export type HomeTextKey = keyof typeof en;

const ar: Record<HomeTextKey, string> = {
  "setup.practice": "جرّب مكالمة تدريبية",
  "guide.title": "دليل الإعداد",
  "guide.intro": "راجع كل خطوة أدناه، أو شغّل اختبارًا سريعًا، أو انتقل مباشرة إلى «أصلحها».",
  "guide.test": "اختبرها",
  "guide.testing": "جارٍ الاختبار…",
  "guide.fix": "أصلحها",
};

export const HOME_TEXT: Record<Locale, Record<HomeTextKey, string>> = { en, ar };

export const isHomeKey = (key: string): key is HomeTextKey => key in en;

export function useHomeText(): (key: HomeTextKey) => string {
  const { locale } = useI18n();
  return (key) => HOME_TEXT[locale][key] ?? en[key];
}
