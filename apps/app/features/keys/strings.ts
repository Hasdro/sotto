/**
 * Strings for "bring your own" providers (D-059) and the company prompt studio (DD-2). English
 * and Arabic in step; kept here, not in lib/i18n.ts (D-058, same pattern as features/email).
 */
import type { Locale } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";

const en = {
  "byo.off.title": "AGN runs this for you",
  "byo.off.body":
    "AGN Sales Shield chooses and pays for the AI and speech providers, keys, models and prompts your calls use. Nothing to set up here. If your company must bring its own, ask AGN support to switch it on.",
  "byo.source.platform": "Provided by AGN",
  "prompts.title": "Prompts",
  "prompts.body":
    "Your company's own versions. A version must pass its test on the recorded calls before you publish it; publishing an older one rolls back.",
  "prompts.seed": "AGN version {version}",
  "prompts.version": "Version {version}",
  "prompts.status.draft": "Draft",
  "prompts.status.published": "Live",
  "prompts.status.retired": "Earlier",
  "prompts.new": "New version",
  "prompts.editor": "Prompt text",
  "prompts.save": "Save draft",
  "prompts.test": "Test on recorded calls",
  "prompts.testing": "Testing…",
  "prompts.publish": "Publish",
  "prompts.unpublish": "Use AGN's version",
  "prompts.result":
    "Quality {quality} · p50 {p50} ms · p95 {p95} ms · {detail} (synthetic: scripted calls, simulated models)",
  "prompts.resultPlain": "{detail}",
  "prompts.failed": "Could not do that: {error}",
  "prompts.offline": "Prompts could not be loaded. Check the connection and try again.",
  "prompts.variables": "Variables you can use: {list}",
} as const;

export type ByoKey = keyof typeof en;

const ar: Record<ByoKey, string> = {
  "byo.off.title": "تتولى AGN هذا عنك",
  "byo.off.body":
    "تختار AGN Sales Shield وتدفع ثمن مزودي الذكاء الاصطناعي وتحويل الكلام والمفاتيح والنماذج والتعليمات التي تستخدمها مكالماتك. لا شيء لإعداده هنا. إذا كانت شركتك مضطرة لاستخدام مزوديها، فاطلب من دعم AGN تفعيل ذلك.",
  "byo.source.platform": "مقدَّم من AGN",
  "prompts.title": "التعليمات",
  "prompts.body":
    "نسخ شركتك الخاصة. يجب أن تنجح النسخة في اختبارها على المكالمات المسجلة قبل نشرها؛ ونشر نسخة أقدم يعيدك إليها.",
  "prompts.seed": "نسخة AGN رقم {version}",
  "prompts.version": "النسخة {version}",
  "prompts.status.draft": "مسودة",
  "prompts.status.published": "مفعّلة",
  "prompts.status.retired": "سابقة",
  "prompts.new": "نسخة جديدة",
  "prompts.editor": "نص التعليمات",
  "prompts.save": "حفظ المسودة",
  "prompts.test": "اختبار على المكالمات المسجلة",
  "prompts.testing": "جارٍ الاختبار…",
  "prompts.publish": "نشر",
  "prompts.unpublish": "استخدام نسخة AGN",
  "prompts.result":
    "الجودة {quality} · p50 {p50} م.ث · p95 {p95} م.ث · {detail} (تجريبي: مكالمات مكتوبة ونماذج محاكاة)",
  "prompts.resultPlain": "{detail}",
  "prompts.failed": "تعذّر ذلك: {error}",
  "prompts.offline": "تعذّر تحميل التعليمات. تحقق من الاتصال وحاول مرة أخرى.",
  "prompts.variables": "المتغيرات المتاحة: {list}",
};

export const BYO_TEXT: Record<Locale, Record<ByoKey, string>> = { en, ar };

export function useByoText(): (key: ByoKey, vars?: Record<string, string>) => string {
  const { locale } = useI18n();
  return (key, vars) =>
    Object.entries(vars ?? {}).reduce(
      (s, [k, v]) => s.split(`{${k}}`).join(v),
      BYO_TEXT[locale][key] as string,
    );
}
