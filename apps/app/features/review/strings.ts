/**
 * Strings for the after-call review and the follow-up card (UX-05, UX-22, UX-23, UX-24, UX-27,
 * INT-07) and the History after-call list. English and Arabic in step (D-058: not in i18n.ts).
 */
import { useMemo } from "react";
import type { Locale } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";

const en = {
  "rv.chance.high": "Likely to close",
  "rv.chance.medium": "Unclear",
  "rv.chance.low": "Unlikely to close",
  "rv.chance.a11y": "Chance to close: {band} ({n}%)",
  "rv.details": "Details",
  "rv.detailsSummary": "Scores, talk time, what went well",
  "rv.risks": "Deal-risk signals",
  "rv.aiEstimated": "AI-estimated",
  "rv.talk": "Talk time",
  "rv.summary": "What happened",
  "fu.title": "Follow up with {name}",
  "fu.titleNoName": "Follow up with the customer",
  "fu.email": "Email",
  "fu.whatsapp": "WhatsApp",
  "fu.channel": "Follow-up channel",
  "fu.drafting": "Writing the follow-up from the call…",
  "fu.none": "No draft this time. Write the email yourself below.",
  "fu.skip": "Skip follow-up",
  "fu.skipped": "Follow-up skipped",
  "fu.undo": "Undo",
  "fu.sent": "Follow-up sent",
  "fu.copyHint": "Email sending is not set up for your organisation: copy this into your mail app.",
  "after.another": "Start another call",
  "after.inHistory": "Cards and transcript are in History",
  "after.allDone": "All done for this call.",
  "hist.after": "After the call",
  "hist.saved": "Saved",
  "hist.skippedItems": "Skipped",
} as const;

export type ReviewKey = keyof typeof en;

const ar: Record<ReviewKey, string> = {
  "rv.chance.high": "مرجّح الإتمام",
  "rv.chance.medium": "غير واضح",
  "rv.chance.low": "غير مرجّح الإتمام",
  "rv.chance.a11y": "فرصة إتمام البيع: {band} ({n}%)",
  "rv.details": "التفاصيل",
  "rv.detailsSummary": "الدرجات ووقت الحديث وما سار جيدًا",
  "rv.risks": "مؤشرات خطر على الصفقة",
  "rv.aiEstimated": "تقدير الذكاء الاصطناعي",
  "rv.talk": "وقت الحديث",
  "rv.summary": "ما حدث",
  "fu.title": "تابع مع {name}",
  "fu.titleNoName": "تابع مع العميل",
  "fu.email": "البريد",
  "fu.whatsapp": "واتساب",
  "fu.channel": "قناة المتابعة",
  "fu.drafting": "جارٍ كتابة المتابعة من المكالمة…",
  "fu.none": "لا توجد مسودة هذه المرة. اكتب الرسالة بنفسك أدناه.",
  "fu.skip": "تخطّي المتابعة",
  "fu.skipped": "تم تخطي المتابعة",
  "fu.undo": "تراجع",
  "fu.sent": "أُرسلت المتابعة",
  "fu.copyHint": "إرسال البريد غير مُعدّ لمؤسستك: انسخ هذا إلى تطبيق البريد.",
  "after.another": "بدء مكالمة أخرى",
  "after.inHistory": "البطاقات والنص في السجل",
  "after.allDone": "انتهى كل شيء لهذه المكالمة.",
  "hist.after": "بعد المكالمة",
  "hist.saved": "حُفظ",
  "hist.skippedItems": "تم التخطي",
};

export const REVIEW_TEXT: Record<Locale, Record<ReviewKey, string>> = { en, ar };

export type ReviewT = (key: ReviewKey, vars?: Record<string, string | number>) => string;

export function reviewText(locale: Locale): ReviewT {
  return (key, vars) =>
    Object.entries(vars ?? {}).reduce(
      (s, [k, v]) => s.split(`{${k}}`).join(String(v)),
      REVIEW_TEXT[locale][key] as string,
    );
}

export function useReviewText(): ReviewT {
  const { locale } = useI18n();
  return useMemo(() => reviewText(locale), [locale]);
}
