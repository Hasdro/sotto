/**
 * Strings for the playbook bootstrap (ZC-04): `boot.*`. English and Arabic in step; kept here,
 * not in lib/i18n.ts (D-058, pattern of features/email/strings.ts).
 */
import type { Locale } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";

const en = {
  "boot.title": "Draft a first playbook",
  "boot.body":
    "AI drafts questions and answers from your own material. Nothing reaches a call until a manager approves it.",
  "boot.consent":
    "An admin must first confirm who processes your data (Settings › AI vendors). Then you can draft answers here.",
  "boot.source": "Where from",
  "boot.source.website": "Website",
  "boot.source.zoho": "Zoho deals",
  "boot.source.document": "Paste text",
  "boot.url": "Page on your website",
  "boot.urlHint": "Only {domains} can be read, over https.",
  "boot.noDomain": "Your team's email domain is a free mail service, so paste the text instead.",
  "boot.zohoHint":
    "Reads your won deals and their notes, read-only. Names and amounts are left out.",
  "boot.zohoOff": "Connect Zoho in Integrations first.",
  "boot.document": "Text to draft from",
  "boot.documentHint":
    "Price lists, FAQs, a brochure. It stays on this device; only the drafts are saved.",
  "boot.draft": "Draft answers",
  "boot.drafting": "Drafting…",
  "boot.added": "{count} drafts are waiting for review below.",
  "boot.none": "The material answers no customer questions. Try another page or paste more text.",
  "boot.failed": "Could not draft: {error}",
  "boot.noModel": "The after-call AI is not set up for your company, so drafts cannot be made.",
  "boot.review": "Needs review ({count})",
  "boot.from.website": "From your website",
  "boot.from.zoho": "From Zoho",
  "boot.from.document": "From pasted text",
  "boot.question": "Customer question",
  "boot.answer": "What the agent says",
  "boot.tooLong": "Keep the answer to {max} words.",
  "boot.approve": "Approve",
  "boot.reject": "Discard",
  "boot.error": "Not saved. Try again.",
};

export type BootKey = keyof typeof en;

const ar: Record<BootKey, string> = {
  "boot.title": "مسودة أول دليل مبيعات",
  "boot.body":
    "يكتب الذكاء الاصطناعي أسئلة وأجوبة من موادكم الخاصة. لا يصل شيء إلى أي مكالمة قبل أن يوافق عليه مدير.",
  "boot.consent":
    "يجب أن يؤكد المسؤول أولًا من يعالج بياناتكم (الإعدادات › مزوّدو الذكاء الاصطناعي). بعدها يمكنك إنشاء المسودات هنا.",
  "boot.source": "المصدر",
  "boot.source.website": "الموقع",
  "boot.source.zoho": "صفقات Zoho",
  "boot.source.document": "لصق نص",
  "boot.url": "صفحة من موقعكم",
  "boot.urlHint": "يمكن قراءة {domains} فقط، عبر https.",
  "boot.noDomain": "نطاق بريد فريقكم خدمة بريد مجانية، لذا الصق النص بدلًا من ذلك.",
  "boot.zohoHint": "يقرأ صفقاتكم الرابحة وملاحظاتها، قراءة فقط. تُحذف الأسماء والمبالغ.",
  "boot.zohoOff": "اربط Zoho من التكاملات أولًا.",
  "boot.document": "النص المطلوب",
  "boot.documentHint":
    "قوائم أسعار، أسئلة شائعة، كتيّب. يبقى النص على هذا الجهاز؛ تُحفظ المسودات فقط.",
  "boot.draft": "إنشاء المسودات",
  "boot.drafting": "جارٍ الإنشاء…",
  "boot.added": "{count} مسودة بانتظار المراجعة أدناه.",
  "boot.none": "لا تجيب هذه المواد عن أسئلة العملاء. جرّب صفحة أخرى أو الصق نصًا أطول.",
  "boot.failed": "تعذّر الإنشاء: {error}",
  "boot.noModel": "ذكاء ما بعد المكالمة غير مُعدّ لشركتكم، لذا لا يمكن إنشاء المسودات.",
  "boot.review": "بانتظار المراجعة ({count})",
  "boot.from.website": "من موقعكم",
  "boot.from.zoho": "من Zoho",
  "boot.from.document": "من نص ملصق",
  "boot.question": "سؤال العميل",
  "boot.answer": "ما يقوله المندوب",
  "boot.tooLong": "اجعل الجواب {max} كلمة على الأكثر.",
  "boot.approve": "موافقة",
  "boot.reject": "تجاهل",
  "boot.error": "لم يُحفظ. حاول مرة أخرى.",
};

export const BOOT_TEXT: Record<Locale, Record<BootKey, string>> = { en, ar };

export function useBootText(): (key: BootKey, vars?: Record<string, string>) => string {
  const { locale } = useI18n();
  return (key, vars) =>
    Object.entries(vars ?? {}).reduce(
      (s, [k, v]) => s.split(`{${k}}`).join(v),
      BOOT_TEXT[locale][key] as string,
    );
}
