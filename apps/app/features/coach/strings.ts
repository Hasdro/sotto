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
  "prep.coach.ask": "Ask the coach",
  "prep.coach.replies": "Coach replies",
  "prep.coach.noZoho": "No Zoho brief linked — coach will work from your notes.",
  "prep.coach.error": "Could not reach the coach right now. Saved inputs stay intact.",

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
  "review.opening":
    "Quick debrief: strong opening and clear pacing. Next time, ask about timeline before quoting. Anything I should remember for next time?",

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
  "brief.today": "Today's meetings ({count}): {titles}.",
  "brief.noneToday": "No meetings today · Next: {day}",
  "brief.tip": "Tip for today: {tip}",

  "admin.title": "Voice coach",
  "admin.subtitle": "Monthly cap and models are managed by the platform owner.",
  "admin.status": "Status",
  "admin.cap": "Monthly cap",
  "admin.spend": "This month's usage",
  "admin.noCap": "Not enabled (no monthly cap set)",
  "admin.capValue": "{amount} a month ({minutes} min)",
  "admin.spendValue": "{amount} ({minutes} min)",
  "admin.transcriptTitle": "Review transcripts",
  "admin.transcriptDesc": "Allow company admins to read agent post-call coach transcripts.",
  "admin.transcriptOn": "Visible to admins",
  "admin.transcriptOff": "Private to each agent",
  "admin.reason.ok": "Active",
  "admin.reason.not_configured": "Not configured",
  "admin.reason.off_by_platform": "Off by platform",
  "admin.reason.no_cap": "No monthly cap set",
  "admin.reason.cap_reached": "Monthly cap reached",
  "admin.error": "Could not save coach settings. Try again.",
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
  "prep.coach.ask": "اسأل المدرب",
  "prep.coach.replies": "ردود المدرب",
  "prep.coach.noZoho": "لا يوجد ملخص من Zoho — سيعمل المدرب من ملاحظاتك.",
  "prep.coach.error": "تعذر الاتصال بالمدرب الآن. تم الحفاظ على مدخلاتك.",

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
  "review.opening":
    "مراجعة سريعة: افتتاحية قوية وإيقاع واضح. في المرة القادمة اسأل عن الجدول الزمني قبل ذكر السعر. هل هناك شيء يجب أن أتذكره للمرة القادمة؟",

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
  "brief.today": "اجتماعات اليوم ({count}): {titles}.",
  "brief.noneToday": "لا اجتماعات اليوم · التالي: {day}",
  "brief.tip": "نصيحة اليوم: {tip}",

  "admin.title": "المدرب الصوتي",
  "admin.subtitle": "الحد الشهري والنماذج تُدار من قبل مالك المنصة.",
  "admin.status": "الحالة",
  "admin.cap": "الحد الشهري",
  "admin.spend": "استخدام هذا الشهر",
  "admin.noCap": "غير مفعل (لم يُحدد حد شهري)",
  "admin.capValue": "{amount} شهريًا ({minutes} دقيقة)",
  "admin.spendValue": "{amount} ({minutes} دقيقة)",
  "admin.transcriptTitle": "نصوص المراجعة",
  "admin.transcriptDesc": "السماح لمديري الشركة بقراءة نصوص مراجعات المدرب للوكلاء.",
  "admin.transcriptOn": "مرئية للمديرين",
  "admin.transcriptOff": "خاصة بكل وكيل",
  "admin.reason.ok": "نشط",
  "admin.reason.not_configured": "غير مُعدّ",
  "admin.reason.off_by_platform": "موقوف من المنصة",
  "admin.reason.no_cap": "لم يُحدد حد شهري",
  "admin.reason.cap_reached": "تم بلوغ الحد الشهري",
  "admin.error": "تعذر حفظ إعدادات المدرب. حاول مرة أخرى.",
};

const tables: Record<Locale, Record<CoachTextKey, string>> = { en, ar };

export type CoachText = (key: CoachTextKey, vars?: Record<string, string | number>) => string;

export function useCoachText(): CoachText {
  const { locale } = useI18n();
  return coachText(locale);
}

/** The same lookup outside React, for pure helpers and their tests. */
export function coachText(locale: Locale): CoachText {
  const table = tables[locale] ?? en;
  return (key, vars) => {
    let out = table[key] ?? en[key];
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        out = out.replace(`{${k}}`, String(v));
      }
    }
    return out;
  };
}
