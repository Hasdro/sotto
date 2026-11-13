/**
 * Live-call strings added by the review round (T-072, D-041): kept here, not in lib/i18n.ts,
 * so this work merges cleanly with the copy pass that owns i18n.ts this wave. English and Arabic
 * in step (pattern of features/email/strings.ts).
 */
import type { Locale } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";

const en = {
  /** The visible R2 line under an AI card's sentence (UX-12). */
  "card.notInPlaybookShort": "Not in playbook — check first",
  /** UX-13: older cards beyond the first two. */
  "card.showEarlier": "Show earlier ({count})",
  "card.showFewer": "Show fewer",
  /** UX-06a: the only mode word in the header, on practice calls. */
  "call.practice": "Practice",
  /** UX-15: the visible label of the context-rail toggle. */
  "call.rail.label": "Context",
  /** UX-02: the thumbs' group name (no visible question). */
  "rating.group": "Rate this suggestion",
  /** UX-01/UX-16/UX-03r/UX-19 (T-075): the context rail before and during the call. */
  "rail.before": "Before the call",
  "rail.brief": "Brief",
  "rail.linked": "Linked to this call.",
  "rail.notLinked": "Not linked to Zoho",
  "rail.link": "Link",
  "rail.more": "More from Zoho",
  "rail.done": "Done",
  "rail.empty": "No brief yet. Use Edit to add the objective and next step.",
  "rail.who": "Who",
  "rail.company": "Company",
  "rail.objective": "Objective",
  "rail.next": "Next step",
  "rail.closes": "closes {date}",
  "prep.help":
    "The AI reads this brief on every customer sentence; a change counts from the next sentence. It is saved with the call.",
  "notes.after": "Note for after the call",
  "notes.afterPlaceholder": "A new phone or email, or anything to update in Zoho after the call",
  "lead.offer.title": "Not in Zoho yet",
  "lead.offer.body": "Add them as a new Lead? Nothing is saved until you approve it.",
  /** Shared primitive labels (Toast action, Sheet close, ChecklistRow edit) and gallery samples. */
  "ui.undo": "Undo",
  "ui.close": "Close",
  "ui.edit": "Edit",
  "ui.sample.noteOn": "Note on",
  "ui.sample.calls": "Calls this week",
  "ui.sample.callsHint": "3 more than last week",
  "ui.sample.task": "Log the call in Zoho",
  "ui.sample.helper": "Enter a client ID first",
  "ui.sample.save": "Save client",
  "ui.sample.deleted": "Note deleted",
  "ui.sample.sheet": "Open sheet",
} as const;

export type CallTextKey = keyof typeof en;

const ar: Record<CallTextKey, string> = {
  "card.notInPlaybookShort": "ليست في الدليل — تأكد أولاً",
  "card.showEarlier": "عرض الأقدم ({count})",
  "card.showFewer": "عرض أقل",
  "call.practice": "تدريب",
  "call.rail.label": "السياق",
  "rating.group": "قيّم هذا الاقتراح",
  "rail.before": "قبل المكالمة",
  "rail.brief": "الملخص",
  "rail.linked": "مرتبط بهذه المكالمة.",
  "rail.notLinked": "غير مرتبط بـ Zoho",
  "rail.link": "اربط",
  "rail.more": "المزيد من Zoho",
  "rail.done": "تم",
  "rail.empty": "لا يوجد ملخص بعد. استخدم «تعديل» لإضافة الهدف والخطوة التالية.",
  "rail.who": "مَن",
  "rail.company": "الشركة",
  "rail.objective": "الهدف",
  "rail.next": "الخطوة التالية",
  "rail.closes": "الإغلاق {date}",
  "prep.help":
    "يقرأ الذكاء الاصطناعي هذا الملخص مع كل جملة يقولها العميل؛ ويُعتمد أي تعديل من الجملة التالية. يُحفظ مع المكالمة.",
  "notes.after": "ملاحظة لما بعد المكالمة",
  "notes.afterPlaceholder": "رقم هاتف أو بريد جديد، أو أي شيء يجب تحديثه في Zoho بعد المكالمة",
  "lead.offer.title": "غير موجود في Zoho بعد",
  "lead.offer.body": "هل تضيفه كعميل محتمل جديد؟ لا يُحفظ شيء قبل موافقتك.",
  "ui.undo": "تراجع",
  "ui.close": "إغلاق",
  "ui.edit": "تعديل",
  "ui.sample.noteOn": "ملاحظة على",
  "ui.sample.calls": "مكالمات هذا الأسبوع",
  "ui.sample.callsHint": "3 أكثر من الأسبوع الماضي",
  "ui.sample.task": "سجّل المكالمة في Zoho",
  "ui.sample.helper": "أدخل معرّف العميل أولاً",
  "ui.sample.save": "احفظ العميل",
  "ui.sample.deleted": "حُذفت الملاحظة",
  "ui.sample.sheet": "افتح اللوحة",
};

export const CALL_TEXT: Record<Locale, Record<CallTextKey, string>> = { en, ar };

export function useCallText(): (key: CallTextKey, vars?: Record<string, string>) => string {
  const { locale } = useI18n();
  return (key, vars) =>
    Object.entries(vars ?? {}).reduce(
      (s, [k, v]) => s.split(`{${k}}`).join(v),
      CALL_TEXT[locale][key] as string,
    );
}
