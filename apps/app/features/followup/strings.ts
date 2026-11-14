/**
 * Follow-up plan strings (INT-08, INT-09, INT-10). English and Arabic in step (D-058: feature
 * strings stay out of lib/i18n.ts).
 */
import type { Locale } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";

const en = {
  "plan.title": "Plan the next steps",
  "plan.hint": "The app reminds you at each step. Nothing is sent until you tap Send.",
  "plan.email": "Email",
  "plan.emailToday": "Today (this card)",
  "plan.emailSent": "Sent",
  "plan.whatsapp": "WhatsApp template",
  "plan.reminder": "Reminder to call",
  "plan.inDays": "In {n} days",
  "plan.off": "Off",
  "plan.meeting": "Meeting reminder (WhatsApp)",
  "plan.meetingWhen": "1 day before the meeting",
  "plan.noTemplate": "No approved WhatsApp template yet.",
  "plan.noPhone": "Add the customer's phone in the WhatsApp tab first.",
  "plan.save": "Save plan",
  "plan.saved": "Plan saved: {n} steps. You'll get a reminder for each.",
  "plan.pause": "Pause",
  "plan.resume": "Resume",
  "plan.cancel": "Cancel plan",
  "plan.paused": "Paused",
  "plan.cancelled": "Plan cancelled",
  "plan.failed": "Could not save the plan: {error}",
  "kind.email": "Email",
  "kind.whatsapp": "WhatsApp",
  "kind.reminder": "Call reminder",
  "kind.meeting_reminder": "Meeting reminder",
  "state.pending": "Planned",
  "state.due": "Due",
  "state.done": "Done",
  "state.skipped": "Skipped",
  "state.cancelled": "Cancelled",
  "due.title": "Follow-ups due",
  "due.none": "Nothing due.",
  "due.open": "Open",
  "due.step": "{kind} for {name}",
  "due.notice": "Follow-up due: {kind} for {name}",
  "due.noticeBody": "Open it to check and send.",
  "step.reminderBody": "Time to call {name}.",
  "step.done": "Mark done",
  "step.skip": "Skip",
  "step.finished": "Step done",
  "step.close": "Close",
  "status.sent": "Sent",
  "status.delivered": "Delivered",
  "status.read": "Read",
  "status.failed": "Not delivered",
} as const;

export type FollowupKey = keyof typeof en;

const ar: Record<FollowupKey, string> = {
  "plan.title": "خطط الخطوات التالية",
  "plan.hint": "يذكّرك التطبيق بكل خطوة. لا يُرسل شيء حتى تضغط إرسال.",
  "plan.email": "البريد",
  "plan.emailToday": "اليوم (هذه البطاقة)",
  "plan.emailSent": "أُرسل",
  "plan.whatsapp": "قالب واتساب",
  "plan.reminder": "تذكير بالاتصال",
  "plan.inDays": "بعد {n} أيام",
  "plan.off": "إيقاف",
  "plan.meeting": "تذكير بالاجتماع (واتساب)",
  "plan.meetingWhen": "قبل الاجتماع بيوم",
  "plan.noTemplate": "لا يوجد قالب واتساب معتمد بعد.",
  "plan.noPhone": "أضف رقم العميل في تبويب واتساب أولًا.",
  "plan.save": "احفظ الخطة",
  "plan.saved": "حُفظت الخطة: {n} خطوات. سيصلك تذكير لكل خطوة.",
  "plan.pause": "إيقاف مؤقت",
  "plan.resume": "استئناف",
  "plan.cancel": "إلغاء الخطة",
  "plan.paused": "متوقفة مؤقتًا",
  "plan.cancelled": "أُلغيت الخطة",
  "plan.failed": "تعذّر حفظ الخطة: {error}",
  "kind.email": "بريد",
  "kind.whatsapp": "واتساب",
  "kind.reminder": "تذكير بالاتصال",
  "kind.meeting_reminder": "تذكير بالاجتماع",
  "state.pending": "مخطط",
  "state.due": "مستحق",
  "state.done": "تم",
  "state.skipped": "تم التخطي",
  "state.cancelled": "ملغى",
  "due.title": "متابعات مستحقة",
  "due.none": "لا شيء مستحق.",
  "due.open": "افتح",
  "due.step": "{kind} إلى {name}",
  "due.notice": "متابعة مستحقة: {kind} إلى {name}",
  "due.noticeBody": "افتحها للتحقق والإرسال.",
  "step.reminderBody": "حان وقت الاتصال بـ {name}.",
  "step.done": "تم",
  "step.skip": "تخطَّ",
  "step.finished": "اكتملت الخطوة",
  "step.close": "إغلاق",
  "status.sent": "أُرسلت",
  "status.delivered": "سُلّمت",
  "status.read": "قُرئت",
  "status.failed": "لم تُسلَّم",
};

export const FOLLOWUP_TEXT: Record<Locale, Record<FollowupKey, string>> = { en, ar };

export type FollowupText = (key: FollowupKey, vars?: Record<string, string | number>) => string;

export function followupText(locale: Locale): FollowupText {
  return (key, vars) =>
    (FOLLOWUP_TEXT[locale][key] ?? en[key]).replace(/\{(\w+)\}/g, (m, k: string) =>
      vars && k in vars ? String(vars[k]) : m,
    );
}

export function useFollowupText(): FollowupText {
  const { locale } = useI18n();
  return followupText(locale);
}
