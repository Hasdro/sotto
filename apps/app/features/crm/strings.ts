/**
 * Strings for the wave-4 Zoho parts (T-082: Blueprint, campaign, AGN fields, export, reconnect;
 * D-058 keeps them out of lib/i18n.ts). English and Arabic in step; a test checks the key sets.
 */
import { useMemo } from "react";
import type { Locale } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";

const en = {
  "bp.title": "Blueprint steps",
  "bp.current": "Now at {state}",
  "bp.need": "To move to {to} you still need:",
  "bp.ready": "Ready to move to {to}.",
  "bp.readOnly": "Read only. Move the deal in Zoho yourself.",
  "bp.suggest": "Add to my prep notes",
  "bp.suggested": "Added to your notes",
  "bp.none": "No Blueprint on this deal.",
  "bp.failed": "Could not read the Blueprint.",
  "campaign.line": "Campaign: {name}",
  "agn.title": "AGN fields in Zoho",
  "agn.body":
    "AGN Sales Shield can write four fields on Deals: call score, chance band, top objection and last call date. Stage and amount are never written.",
  "agn.preview": "Check the fields",
  "agn.exists": "Already in Zoho",
  "agn.missing": "Will be created",
  "agn.notWritable": "Exists with another API name; left alone",
  "agn.create": "Create {n} fields in Zoho",
  "agn.confirm": "I checked the list. Create only the missing fields.",
  "agn.done": "All AGN fields are in Zoho.",
  "agn.failed": "Could not reach Zoho. Try again.",
  "agn.reconnect": "Reconnect Zoho first (new permissions).",
  "export.title": "Weekly export for Zoho Analytics",
  "export.body":
    "A CSV of last week's calls: scores, counts, objection categories and Zoho ids. No call text.",
  "export.download": "Download last week (CSV)",
  "export.failed": "Could not download the export.",
  "export.webOnly": "Download it on the web or desktop app.",
  "health.zoho_scopes_outdated": "Zoho needs new permissions for tasks, deal fields and campaigns.",
  "health.fix.zoho_scopes_outdated": "Reconnect Zoho",
} as const;

export type CrmKey = keyof typeof en;

const ar: Record<CrmKey, string> = {
  "bp.title": "خطوات Blueprint",
  "bp.current": "المرحلة الحالية: {state}",
  "bp.need": "للانتقال إلى {to} ما زلت تحتاج إلى:",
  "bp.ready": "جاهز للانتقال إلى {to}.",
  "bp.readOnly": "للقراءة فقط. انقل الصفقة في Zoho بنفسك.",
  "bp.suggest": "أضف إلى ملاحظات التحضير",
  "bp.suggested": "أُضيف إلى ملاحظاتك",
  "bp.none": "لا يوجد Blueprint على هذه الصفقة.",
  "bp.failed": "تعذّرت قراءة Blueprint.",
  "campaign.line": "الحملة: {name}",
  "agn.title": "حقول AGN في Zoho",
  "agn.body":
    "يمكن لـ AGN Sales Shield كتابة أربعة حقول على الصفقات: تقييم المكالمة، ونطاق الفرصة، وأبرز اعتراض، وتاريخ آخر مكالمة. لا تُكتب المرحلة ولا المبلغ أبدًا.",
  "agn.preview": "راجع الحقول",
  "agn.exists": "موجود في Zoho",
  "agn.missing": "سيُنشأ",
  "agn.notWritable": "موجود باسم API آخر؛ لن يُغيَّر",
  "agn.create": "إنشاء {n} حقول في Zoho",
  "agn.confirm": "راجعت القائمة. أنشئ الحقول الناقصة فقط.",
  "agn.done": "كل حقول AGN موجودة في Zoho.",
  "agn.failed": "تعذّر الوصول إلى Zoho. حاول مرة أخرى.",
  "agn.reconnect": "أعد ربط Zoho أولًا (صلاحيات جديدة).",
  "export.title": "تصدير أسبوعي إلى Zoho Analytics",
  "export.body":
    "ملف CSV لمكالمات الأسبوع الماضي: التقييمات والأعداد وفئات الاعتراضات ومعرّفات Zoho. بلا نص المكالمات.",
  "export.download": "تنزيل الأسبوع الماضي (CSV)",
  "export.failed": "تعذّر تنزيل الملف.",
  "export.webOnly": "نزّله من تطبيق الويب أو سطح المكتب.",
  "health.zoho_scopes_outdated": "يحتاج Zoho إلى صلاحيات جديدة للمهام وحقول الصفقات والحملات.",
  "health.fix.zoho_scopes_outdated": "أعد ربط Zoho",
};

export const CRM_TEXT: Record<Locale, Record<CrmKey, string>> = { en, ar };
export type CrmT = (key: CrmKey, vars?: Record<string, string | number>) => string;

export function crmText(locale: Locale): CrmT {
  return (key, vars) =>
    Object.entries(vars ?? {}).reduce(
      (s, [k, v]) => s.split(`{${k}}`).join(String(v)),
      CRM_TEXT[locale][key] as string,
    );
}

export function useCrmText(): CrmT {
  const { locale } = useI18n();
  return useMemo(() => crmText(locale), [locale]);
}
