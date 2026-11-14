/**
 * Strings for the after-call checklist (UX-04, UX-23, UX-41, INT-01c, INT-02m; D-058 keeps them
 * out of lib/i18n.ts). English and Arabic in step; a test checks the key sets match.
 */

import { useMemo } from "react";
import type { Locale } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";

const en = {
  "after.updates": "Suggested updates ({n})",
  "after.updatesBody": "Nothing is saved until you tick it and press Save.",
  "after.save": "Save {n} to Zoho",
  "after.saveNone": "Save to Zoho",
  "after.saveHelper": "Tick the updates you want in Zoho",
  "after.saving": "Saving…",
  "after.done": "Saved to Zoho ✓",
  "after.open": "Open in Zoho",
  "after.allHandled": "All updates handled.",
  "after.edit": "Edit",
  "after.skip": "Skip",
  "after.skipItem": "Skip {label}",
  "after.skipped": "Skipped",
  "after.undo": "Undo",
  "after.callLog": "Call log: summary, objections, next step",
  "after.callLog.waiting": "Call log: waiting for the review",
  "after.callLog.preview": "Zoho gets exactly this note",
  "after.callLog.summary": "Summary",
  "after.callLog.objections": "Objections",
  "after.callLog.commitments": "Commitments",
  "after.callLog.nextStep": "Next step",
  "after.callLog.note": "Your note for after the call",
  "after.callLog.risks": "Add the risk signals (AI-estimated) to the note",
  "after.meeting": "Meeting: {when}",
  "after.meeting.unset": "Meeting: set the date and time",
  "after.meeting.confirmFirst": "Open Edit and confirm the date, time and time zone first",
  "after.meeting.date": "Date (YYYY-MM-DD)",
  "after.meeting.time": "Time (HH:MM, 24 h)",
  "after.meeting.confirm": "I checked the date, time and time zone ({tz})",
  "after.contact": "Update contact {name}",
  "after.lead": "Create a lead",
  "after.dealNote": "Note on {deal}",
  "after.status.saved": "Saved",
  "after.status.failed": "Not saved. Try again.",
  "after.status.unknown": "Zoho did not confirm. Check Zoho before trying again.",
  "after.status.reconnect": "Reconnect Zoho to save this.",
  "after.task": "Task due {when} for {owner}",
  "after.task.unset": "Task: set the due date and owner",
  "after.task.subject": "Task",
  "after.task.due": "Due date (YYYY-MM-DD)",
  "after.task.description": "Details",
  "after.task.owner": "Owner",
  "after.task.me": "{name} (you)",
  "after.task.ownerPicked": "{name}, chosen",
  "after.task.confirm": "I checked the due date and the owner",
  "after.task.confirmFirst": "Open Edit and confirm the due date and owner first",
  "after.task.badDate": "Enter the due date as YYYY-MM-DD",
  "after.task.noOwner": "Pick who owns the task",
  "after.agn": "AGN fields on {deal}: score {score}",
  "after.agn.score": "Call score (0–100)",
  "after.agn.objection": "Top objection",
  "after.agn.badScore": "The score must be 0 to 100",
  "after.agn.preview": "Only these AGN fields are written; stage and amount are never changed.",
  "after.agn.chance": "Chance band: {band}",
} as const;

export type ActionsKey = keyof typeof en;

const ar: Record<ActionsKey, string> = {
  "after.updates": "تحديثات مقترحة ({n})",
  "after.updatesBody": "لا يُحفظ شيء حتى تحدده وتضغط حفظ.",
  "after.save": "حفظ {n} في Zoho",
  "after.saveNone": "الحفظ في Zoho",
  "after.saveHelper": "حدّد التحديثات التي تريدها في Zoho",
  "after.saving": "جارٍ الحفظ…",
  "after.done": "حُفظ في Zoho ✓",
  "after.open": "فتح في Zoho",
  "after.allHandled": "تمت معالجة كل التحديثات.",
  "after.edit": "تعديل",
  "after.skip": "تخطٍّ",
  "after.skipItem": "تخطّي {label}",
  "after.skipped": "تم التخطي",
  "after.undo": "تراجع",
  "after.callLog": "سجل المكالمة: الملخص والاعتراضات والخطوة التالية",
  "after.callLog.waiting": "سجل المكالمة: بانتظار المراجعة",
  "after.callLog.preview": "هذه هي الملاحظة التي ستصل إلى Zoho تمامًا",
  "after.callLog.summary": "الملخص",
  "after.callLog.objections": "الاعتراضات",
  "after.callLog.commitments": "الالتزامات",
  "after.callLog.nextStep": "الخطوة التالية",
  "after.callLog.note": "ملاحظتك لما بعد المكالمة",
  "after.callLog.risks": "أضف مؤشرات الخطر (تقدير الذكاء الاصطناعي) إلى الملاحظة",
  "after.meeting": "اجتماع: {when}",
  "after.meeting.unset": "اجتماع: حدّد التاريخ والوقت",
  "after.meeting.confirmFirst": "افتح تعديل وأكّد التاريخ والوقت والمنطقة الزمنية أولًا",
  "after.meeting.date": "التاريخ (YYYY-MM-DD)",
  "after.meeting.time": "الوقت (HH:MM، 24 ساعة)",
  "after.meeting.confirm": "راجعت التاريخ والوقت والمنطقة الزمنية ({tz})",
  "after.contact": "تحديث جهة الاتصال {name}",
  "after.lead": "إنشاء عميل محتمل",
  "after.dealNote": "ملاحظة على {deal}",
  "after.status.saved": "حُفظ",
  "after.status.failed": "لم يُحفظ. حاول مرة أخرى.",
  "after.status.unknown": "لم يؤكد Zoho. تحقّق من Zoho قبل المحاولة مجددًا.",
  "after.status.reconnect": "أعد ربط Zoho لحفظ هذا.",
  "after.task": "مهمة مستحقة {when} لـ {owner}",
  "after.task.unset": "مهمة: حدّد تاريخ الاستحقاق والمسؤول",
  "after.task.subject": "المهمة",
  "after.task.due": "تاريخ الاستحقاق (YYYY-MM-DD)",
  "after.task.description": "التفاصيل",
  "after.task.owner": "المسؤول",
  "after.task.me": "{name} (أنت)",
  "after.task.ownerPicked": "{name}، مُختار",
  "after.task.confirm": "راجعت تاريخ الاستحقاق والمسؤول",
  "after.task.confirmFirst": "افتح تعديل وأكّد تاريخ الاستحقاق والمسؤول أولًا",
  "after.task.badDate": "أدخل تاريخ الاستحقاق بالشكل YYYY-MM-DD",
  "after.task.noOwner": "اختر مسؤول المهمة",
  "after.agn": "حقول AGN على {deal}: التقييم {score}",
  "after.agn.score": "تقييم المكالمة (0–100)",
  "after.agn.objection": "أبرز اعتراض",
  "after.agn.badScore": "يجب أن يكون التقييم بين 0 و100",
  "after.agn.preview": "تُكتب حقول AGN هذه فقط؛ لا تتغيّر المرحلة ولا المبلغ أبدًا.",
  "after.agn.chance": "نطاق فرصة الإغلاق: {band}",
};

export const ACTIONS_TEXT: Record<Locale, Record<ActionsKey, string>> = { en, ar };

export type ActionsT = (key: ActionsKey, vars?: Record<string, string | number>) => string;

export function actionsText(locale: Locale): ActionsT {
  return (key, vars) =>
    Object.entries(vars ?? {}).reduce(
      (s, [k, v]) => s.split(`{${k}}`).join(String(v)),
      ACTIONS_TEXT[locale][key] as string,
    );
}

export function useActionsText(): ActionsT {
  const { locale } = useI18n();
  return useMemo(() => actionsText(locale), [locale]);
}
