/**
 * Bilingual (English + Arabic) strings for the Post-Call Wizard (A1–A2) and Style Memory (A3–A4).
 * Follows the repo's OwnLabel / feature-local strings pattern (D-058) to avoid merge conflicts in lib/i18n.ts.
 */
import { useCallback } from "react";
import type { Locale } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";

const STRINGS = {
  en: {
    "wizard.title": "After-call wrap-up",
    "wizard.stepOf": "Step {current} of {total}",
    "wizard.step.review": "Call review",
    "wizard.step.whatsapp": "WhatsApp follow-up",
    "wizard.step.email": "Email follow-up",
    "wizard.step.zoho": "Zoho actions",
    "wizard.step.feedback": "Card feedback",
    "wizard.back": "Back",
    "wizard.skip": "Skip",
    "wizard.next": "Next",
    "wizard.done": "Done",
    "wizard.finishLater": "Finish later",
    "wizard.savedNotice": "Saved your place for 24 hours.",
    "wizard.saveError": "Could not save your place right now. Try again when online.",
    "wizard.draftsExpired": "Unsent drafts expired after 24 hours. You can still share feedback.",
    "wizard.talkItThrough": "Talk it through",
    "wizard.sendNote":
      "Next and Skip never send anything. Use the send or save button above to act.",
    "feedback.heading": "How were the AI cards?",
    "feedback.subheading":
      "Your ratings and notes shape your personal style memory for future calls.",
    "feedback.noCards": "No AI suggestion cards were shown on this call.",
    "feedback.cardNoteLabel": "Optional note for this card",
    "feedback.cardNotePlaceholder": "What would have helped here?",
    "feedback.callNoteLabel": "What should the AI do differently?",
    "feedback.callNotePlaceholder": "Type or dictate with your keyboard mic…",
    "feedback.submit": "Save feedback",
    "feedback.saving": "Saving…",
    "feedback.saved": "Feedback saved.",
    "feedback.up": "Helpful",
    "feedback.down": "Not helpful",
    "feedback.queuedOffline": "Offline — feedback queued and will sync when you reconnect.",
    "feedback.reason.too_long": "Too long",
    "feedback.reason.too_formal": "Too formal",
    "feedback.reason.wrong": "Wrong",
    "feedback.reason.not_relevant": "Not relevant",
    "feedback.reason.good_phrasing": "Good phrasing",
    "feedback.learnedToast": "Learned {count} new things – view",
    "feedback.learnedOne": "Learned 1 new thing – view",
    "memory.title": "Style memory",
    "memory.subtitle":
      "Compact rules learned from call feedback (max 12 rules, 25 words each). Company rules always apply before personal rules.",
    "memory.myTab": "My rules",
    "memory.companyTab": "Company rules",
    "memory.agentsTab": "Team agents",
    "memory.effective": "Active on your next call ({count}/12)",
    "memory.empty":
      "No style rules yet. Rate cards or leave a note after a call to start learning.",
    "memory.agentRules": "Personal style rules",
    "memory.words": "{count}/{max} words",
    "memory.wordsOver": "Keep every rule at {max} words or fewer before saving.",
    "memory.reviewToggle": "Review before apply",
    "memory.reviewDesc":
      "Hold newly merged agent rules for admin approval before they enter live calls.",
    "memory.pendingTitle": "Pending approval (v{version})",
    "memory.approve": "Approve",
    "memory.reject": "Reject",
    "memory.edit": "Save changes",
    "memory.addRule": "Add rule",
    "memory.promote": "Promote to company",
    "memory.promoted": "Promoted to company-wide rules.",
    "memory.revert": "Revert to v{version}",
    "memory.versions": "Version history",
    "memory.disabled": "Disabled",
    "memory.enabled": "Enabled",
    "memory.remove": "Remove",
    "memory.rulePlaceholder": "Keep each rule under 25 words…",
    "memory.saved": "Style memory updated.",
    "memory.error": "Could not update style memory. Please try again.",
  },
  ar: {
    "wizard.title": "ملخص ما بعد المكالمة",
    "wizard.stepOf": "الخطوة {current} من {total}",
    "wizard.step.review": "مراجعة المكالمة",
    "wizard.step.whatsapp": "متابعة واتساب",
    "wizard.step.email": "متابعة البريد الإلكتروني",
    "wizard.step.zoho": "إجراءات زوهو",
    "wizard.step.feedback": "تقييم البطاقات",
    "wizard.back": "رجوع",
    "wizard.skip": "تخطي",
    "wizard.next": "التالي",
    "wizard.done": "تم",
    "wizard.finishLater": "إكمال لاحقاً",
    "wizard.savedNotice": "تم حفظ مكانك لمدة 24 ساعة.",
    "wizard.saveError": "تعذّر حفظ مكانك حالياً. حاول مرة أخرى عند الاتصال.",
    "wizard.draftsExpired":
      "انتهت صلاحية المسودات غير المرسلة بعد 24 ساعة. لا يزال بإمكانك إرسال ملاحظاتك.",
    "wizard.talkItThrough": "ناقشها صوتياً",
    "wizard.sendNote":
      "زرا التالي وتخطي لا يرسلان أي شيء. استخدم زر الإرسال أو الحفظ أعلاه للتنفيذ.",
    "feedback.heading": "كيف كانت بطاقات الذكاء الاصطناعي؟",
    "feedback.subheading": "تقييماتك وملاحظاتك تشكّل ذاكرة أسلوبك الشخصية للمكالمات القادمة.",
    "feedback.noCards": "لم تظهر بطاقات اقتراحات ذكية في هذه المكالمة.",
    "feedback.cardNoteLabel": "ملاحظة اختيارية لهذه البطاقة",
    "feedback.cardNotePlaceholder": "ما الذي كان سيساعد هنا؟",
    "feedback.callNoteLabel": "ما الذي يجب على الذكاء الاصطناعي فعله بشكل مختلف؟",
    "feedback.callNotePlaceholder": "اكتب أو استعمل الإملاء الصوتي في لوحة المفاتيح…",
    "feedback.submit": "حفظ الملاحظات",
    "feedback.saving": "جارٍ الحفظ…",
    "feedback.saved": "تم حفظ الملاحظات.",
    "feedback.up": "مفيد",
    "feedback.down": "غير مفيد",
    "feedback.queuedOffline": "غير متصل — تم حفظ الملاحظات وستتم مزامنتها عند عودة الاتصال.",
    "feedback.reason.too_long": "طويلة جداً",
    "feedback.reason.too_formal": "رسمية جداً",
    "feedback.reason.wrong": "غير صحيحة",
    "feedback.reason.not_relevant": "غير ذات صلة",
    "feedback.reason.good_phrasing": "صياغة ممتازة",
    "feedback.learnedToast": "تم تعلّم {count} أمور جديدة – عرض",
    "feedback.learnedOne": "تم تعلّم أمر جديد واحد – عرض",
    "memory.title": "ذاكرة الأسلوب",
    "memory.subtitle":
      "قواعد مختصرة متعلّمة من ملاحظات المكالمات (بحد أقصى 12 قاعدة، 25 كلمة لكل قاعدة). قواعد الشركة تتقدم دائماً على القواعد الشخصية.",
    "memory.myTab": "قواعدي",
    "memory.companyTab": "قواعد الشركة",
    "memory.agentsTab": "فريق المبيعات",
    "memory.effective": "مفعّلة في مكالمتك القادمة ({count}/12)",
    "memory.empty":
      "لا توجد قواعد أسلوب بعد. قيّم البطاقات أو اترك ملاحظة بعد المكالمة لبدء التعلّم.",
    "memory.agentRules": "قواعد الأسلوب الشخصية",
    "memory.words": "{count}/{max} كلمة",
    "memory.wordsOver": "اجعل كل قاعدة {max} كلمة أو أقل قبل الحفظ.",
    "memory.reviewToggle": "المراجعة قبل التطبيق",
    "memory.reviewDesc":
      "إيقاف القواعد الجديدة بانتظار موافقة المشرف قبل دخولها في المكالمات المباشرة.",
    "memory.pendingTitle": "بانتظار الموافقة (الإصدار {version})",
    "memory.approve": "موافقة",
    "memory.reject": "رفض",
    "memory.edit": "حفظ التغييرات",
    "memory.addRule": "إضافة قاعدة",
    "memory.promote": "ترقية للشركة",
    "memory.promoted": "تمت الترقية إلى قواعد الشركة.",
    "memory.revert": "استعادة الإصدار {version}",
    "memory.versions": "سجل الإصدارات",
    "memory.disabled": "معطّلة",
    "memory.enabled": "مفعّلة",
    "memory.remove": "حذف",
    "memory.rulePlaceholder": "اجعل كل قاعدة أقل من 25 كلمة…",
    "memory.saved": "تم تحديث ذاكرة الأسلوب.",
    "memory.error": "تعذّر تحديث ذاكرة الأسلوب. حاول مرة أخرى.",
  },
} as const;

export type PostCallKey = keyof (typeof STRINGS)["en"];

export function postCallText(
  locale: Locale,
  key: PostCallKey,
  vars?: Record<string, string | number>,
): string {
  const table = STRINGS[locale] ?? STRINGS.en;
  let out: string = table[key] ?? STRINGS.en[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.replaceAll(`{${k}}`, String(v));
    }
  }
  return out;
}

export function usePostCallText() {
  const { locale } = useI18n();
  return useCallback(
    (key: PostCallKey, vars?: Record<string, string | number>) => postCallText(locale, key, vars),
    [locale],
  );
}
