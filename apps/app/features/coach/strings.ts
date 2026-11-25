/**
 * Bilingual strings (English + Arabic) for Round 4 Agent 3: prep coach, game plan,
 * voice coach review, review queue, morning brief, and admin coach settings.
 * Kept local to `features/coach/` so `lib/i18n.ts` has zero merge conflicts.
 */

import type { Locale } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";

const en = {
  "prep.coach.title": "Prep coach",
  "prep.coach.subtitle": "Brainstorm this call or skip straight to Start listening.",
  "prep.coach.placeholder": "Ask about objections, goals, or opening lines…",
  "prep.coach.send": "Send",
  "prep.coach.voiceOn": "Voice",
  "prep.coach.voiceOff": "Text",
  "prep.coach.generate": "Build game plan",
  "prep.coach.generating": "Building game plan…",
  "prep.coach.startNow": "Start listening",
  "prep.coach.noZoho": "No Zoho brief linked — coach will work from your notes.",

  "plan.title": "Game plan",
  "plan.goals": "3 Goals",
  "plan.objections": "Likely objections & answers",
  "plan.questions": "Questions to ask",
  "plan.avoid": "What not to say",
  "plan.save": "Save game plan",
  "plan.saved": "Game plan saved for this call.",
  "plan.empty": "No game plan yet. Build one before starting or add notes directly.",

  "review.title": "Call review coach",
  "review.subtitle": "Under 3 minutes · interrupt anytime · text fallback ready.",
  "review.interrupt": "Interrupt",
  "review.speak": "Speak",
  "review.textFallback": "Type your reply instead…",
  "review.rememberLabel": "Anything I should remember for next time?",
  "review.rememberPlaceholder": "e.g. Confirm timeline before quoting price",
  "review.finish": "Finish review",
  "review.cancel": "Close",
  "review.done": "Review saved and added to your style memory.",
  "review.timer": "{remaining} left",

  "queue.title": "Pending call reviews",
  "queue.badge": "{count}",
  "queue.empty": "All caught up — no pending reviews.",
  "queue.start": "Talk it through",
  "queue.snooze1h": "In 1 hour",
  "queue.snoozeTomorrow": "Tomorrow morning",
  "queue.snoozePick": "Pick a time",
  "queue.dismiss": "Dismiss",
  "queue.snoozed": "Snoozed",

  "brief.title": "Morning brief",
  "brief.voice": "Listen",
  "brief.off": "Turn off morning brief",
  "brief.on": "Turn on morning brief",
  "brief.pending": "{count} pending reviews",

  "admin.title": "Voice coach",
  "admin.subtitle": "Monthly cap and models are managed by the platform owner.",
  "admin.status": "Status",
  "admin.cap": "Monthly cap",
  "admin.spend": "This month's usage",
  "admin.noCap": "Not enabled (no monthly cap set)",
  "admin.transcriptTitle": "Review transcripts",
  "admin.transcriptDesc": "Allow company admins to read agent post-call coach transcripts.",
  "admin.transcriptOn": "Visible to admins",
  "admin.transcriptOff": "Private to each agent",
} as const;

export type CoachTextKey = keyof typeof en;

const ar: Record<CoachTextKey, string> = {
  "prep.coach.title": "مدرب التحضير",
  "prep.coach.subtitle": "ناقش المكالمة سريعاً أو اضغط بدء الاستماع مباشرة.",
  "prep.coach.placeholder": "اسأل عن الاعتراضات أو الأهداف أو الافتتاحية…",
  "prep.coach.send": "إرسال",
  "prep.coach.voiceOn": "صوت",
  "prep.coach.voiceOff": "نص",
  "prep.coach.generate": "إنشاء خطة المكالمة",
  "prep.coach.generating": "جارٍ إعداد خطة المكالمة…",
  "prep.coach.startNow": "بدء الاستماع",
  "prep.coach.noZoho": "لا يوجد ملخص من Zoho — سيعمل المدرب من ملاحظاتك.",

  "plan.title": "خطة المكالمة",
  "plan.goals": "3 أهداف",
  "plan.objections": "الاعتراضات المحتملة والردود",
  "plan.questions": "أسئلة لطرحها",
  "plan.avoid": "ما يجب تجنب قوله",
  "plan.save": "حفظ الخطة",
  "plan.saved": "تم حفظ خطة المكالمة.",
  "plan.empty": "لا توجد خطة بعد. أنشئ خطة قبل البدء أو أضف ملاحظاتك.",

  "review.title": "مراجعة المكالمة مع المدرب",
  "review.subtitle": "أقل من 3 دقائق · يمكنك المقاطعة في أي وقت · الكتابة متاحة دائماً.",
  "review.interrupt": "مقاطعة",
  "review.speak": "تحدث",
  "review.textFallback": "اكتب ردك هنا بدلاً من الصوت…",
  "review.rememberLabel": "هل هناك شيء يجب أن أتذكره للمرة القادمة؟",
  "review.rememberPlaceholder": "مثال: تأكد من الجدول الزمني قبل ذكر السعر",
  "review.finish": "إنهاء المراجعة",
  "review.cancel": "إغلاق",
  "review.done": "تم حفظ المراجعة وإضافتها إلى ذاكرة أسلوبك.",
  "review.timer": "المتبقي {remaining}",

  "queue.title": "مراجعات المكالمات المعلقة",
  "queue.badge": "{count}",
  "queue.empty": "لا توجد مراجعات معلقة حالياً.",
  "queue.start": "ناقش المكالمة",
  "queue.snooze1h": "بعد ساعة",
  "queue.snoozeTomorrow": "صباح الغد",
  "queue.snoozePick": "اختر وقتاً",
  "queue.dismiss": "تجاهل",
  "queue.snoozed": "مؤجلة",

  "brief.title": "موجز الصباح",
  "brief.voice": "استماع",
  "brief.off": "إيقاف موجز الصباح",
  "brief.on": "تفعيل موجز الصباح",
  "brief.pending": "{count} مراجعات معلقة",

  "admin.title": "المدرب الصوتي",
  "admin.subtitle": "الحد الشهري والنماذج تُدار من قبل مالك المنصة.",
  "admin.status": "الحالة",
  "admin.cap": "الحد الشهري",
  "admin.spend": "استخدام هذا الشهر",
  "admin.noCap": "غير مفعل (لم يُحدد حد شهري)",
  "admin.transcriptTitle": "نصوص المراجعة",
  "admin.transcriptDesc": "السماح لمديري الشركة بقراءة نصوص مراجعات المدرب للوكلاء.",
  "admin.transcriptOn": "مرئية للمديرين",
  "admin.transcriptOff": "خاصة بكل وكيل",
};

const tables: Record<Locale, Record<CoachTextKey, string>> = { en, ar };

export function useCoachText() {
  const { locale } = useI18n();
  const table = tables[locale] ?? en;
  return (key: CoachTextKey, vars?: Record<string, string | number>): string => {
    let out = table[key] ?? en[key];
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        out = out.replace(`{${k}}`, String(v));
      }
    }
    return out;
  };
}
