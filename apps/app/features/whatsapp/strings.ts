/**
 * Strings for WhatsApp through Gallabox (D-033, D-039): `integrations.gallabox.*` and
 * `whatsapp.*`. English and Arabic in step; same pattern as features/flags/strings.ts.
 */
import type { Locale } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";

const en = {
  "integrations.gallabox.title": "WhatsApp (Gallabox)",
  "integrations.gallabox.body":
    "From Gallabox › Settings › Developer › API Keys. All four values are encrypted on the server and never shown again; leave a field empty to keep it.",
  "integrations.gallabox.connected": "Gallabox Connected",
  "integrations.gallabox.none": "Gallabox not connected",
  "integrations.gallabox.apiKey": "API key",
  "integrations.gallabox.apiSecret": "API secret",
  "integrations.gallabox.accountId": "Account ID",
  "integrations.gallabox.channelId": "Channel ID",
  "integrations.gallabox.save": "Save keys",
  "integrations.gallabox.remove": "Remove",
  "integrations.gallabox.saved": "Saved.",
  "integrations.gallabox.failed": "Could not save: {error}",
  "integrations.gallabox.templates": "Templates agents may send",
  "integrations.gallabox.templatesBody":
    "Only approved WhatsApp templates on this list can be sent, and only after the agent confirms. Free-form messages are off.",
  "integrations.gallabox.load": "Load templates from Gallabox",
  "integrations.gallabox.loading": "Loading…",
  "integrations.gallabox.loadFailed": "Could not load templates: {error}",
  "integrations.gallabox.pick": "Choose templates",
  "integrations.gallabox.params": "Fills: {params}",
  "integrations.gallabox.noParams": "No parameters",
  "integrations.gallabox.notApproved": "Not approved yet ({status})",
  "integrations.gallabox.saveList": "Save list",
  "integrations.gallabox.listSaved": "Saved {count} templates.",
  "integrations.gallabox.allowed": "On the list",
  "integrations.gallabox.empty": "No templates on the list yet.",
  "whatsapp.title": "Send WhatsApp",
  "whatsapp.templateOnly": "Approved templates only.",
  "whatsapp.template": "Template",
  "whatsapp.none": "Your admin has not chosen any templates yet.",
  "whatsapp.name": "Customer name",
  "whatsapp.nameFills": "Also fills {fields} in the message.",
  "whatsapp.message": "Message",
  "whatsapp.phone": "Phone with country code",
  "whatsapp.param": "{name}",
  "whatsapp.example": "e.g. {example}",
  "whatsapp.preview": "Preview",
  "whatsapp.previewTitle": "This is exactly what will be sent",
  "whatsapp.to": "To {name} · {phone}",
  "whatsapp.edit": "Edit",
  "whatsapp.confirm": "Confirm and send",
  "whatsapp.sending": "Sending…",
  "whatsapp.sent": "Sent.",
  "whatsapp.duplicate": "Already sent; not sent again.",
  "whatsapp.failed": "Not sent: {error}",
  "whatsapp.another": "Send another",
  "hook.title": "Delivery status (webhook)",
  "hook.hint":
    "Shows sent, delivered, read or failed for each message. Needs a Gallabox plan with webhooks (Essential or Advanced). Only the status is kept, never the text.",
  "hook.off": "Turn on \u201cWhatsApp delivery status\u201d in Admin \u203a Features first.",
  "hook.create": "Create webhook URL",
  "hook.rotate": "Replace URL and secret",
  "hook.url": "Webhook URL",
  "hook.secret": "Secret (shown once)",
  "hook.steps":
    "In Gallabox \u203a Settings \u203a Webhooks: add this URL with the events Message.WA.Status.Received and Message.WA.Status.Failed, and paste the secret.",
  "hook.ready": "Webhook URL set. Replace it if the secret was lost.",
} as const;

export type WhatsAppKey = keyof typeof en;

const ar: Record<WhatsAppKey, string> = {
  "integrations.gallabox.title": "واتساب (Gallabox)",
  "integrations.gallabox.body":
    "من Gallabox › الإعدادات › المطوّر › مفاتيح API. تُشفَّر القيم الأربع على الخادم ولا تُعرض مرة أخرى؛ اترك الحقل فارغًا للإبقاء عليه.",
  "integrations.gallabox.connected": "Gallabox متصل",
  "integrations.gallabox.none": "Gallabox غير متصل",
  "integrations.gallabox.apiKey": "مفتاح API",
  "integrations.gallabox.apiSecret": "سر API",
  "integrations.gallabox.accountId": "معرّف الحساب",
  "integrations.gallabox.channelId": "معرّف القناة",
  "integrations.gallabox.save": "حفظ المفاتيح",
  "integrations.gallabox.remove": "إزالة",
  "integrations.gallabox.saved": "تم الحفظ.",
  "integrations.gallabox.failed": "تعذّر الحفظ: {error}",
  "integrations.gallabox.templates": "القوالب التي يمكن للوكلاء إرسالها",
  "integrations.gallabox.templatesBody":
    "لا يُرسل إلا قوالب واتساب المعتمدة في هذه القائمة، وبعد تأكيد الوكيل فقط. الرسائل الحرة متوقفة.",
  "integrations.gallabox.load": "تحميل القوالب من Gallabox",
  "integrations.gallabox.loading": "جارٍ التحميل…",
  "integrations.gallabox.loadFailed": "تعذّر تحميل القوالب: {error}",
  "integrations.gallabox.pick": "اختر القوالب",
  "integrations.gallabox.params": "الحقول: {params}",
  "integrations.gallabox.noParams": "بلا حقول",
  "integrations.gallabox.notApproved": "غير معتمد بعد ({status})",
  "integrations.gallabox.saveList": "حفظ القائمة",
  "integrations.gallabox.listSaved": "حُفظ {count} من القوالب.",
  "integrations.gallabox.allowed": "في القائمة",
  "integrations.gallabox.empty": "لا توجد قوالب في القائمة بعد.",
  "whatsapp.title": "إرسال واتساب",
  "whatsapp.templateOnly": "القوالب المعتمدة فقط.",
  "whatsapp.template": "القالب",
  "whatsapp.none": "لم يختر المسؤول أي قوالب بعد.",
  "whatsapp.name": "اسم العميل",
  "whatsapp.nameFills": "ويملأ أيضًا {fields} في الرسالة.",
  "whatsapp.message": "الرسالة",
  "whatsapp.phone": "رقم الهاتف مع رمز الدولة",
  "whatsapp.param": "{name}",
  "whatsapp.example": "مثال: {example}",
  "whatsapp.preview": "معاينة",
  "whatsapp.previewTitle": "هذا بالضبط ما سيُرسل",
  "whatsapp.to": "إلى {name} · {phone}",
  "whatsapp.edit": "تعديل",
  "whatsapp.confirm": "تأكيد وإرسال",
  "whatsapp.sending": "جارٍ الإرسال…",
  "whatsapp.sent": "أُرسلت.",
  "whatsapp.duplicate": "أُرسلت سابقًا؛ لم تُرسل مرة أخرى.",
  "whatsapp.failed": "لم تُرسل: {error}",
  "whatsapp.another": "إرسال رسالة أخرى",
  "hook.title": "حالة التسليم (Webhook)",
  "hook.hint":
    "يعرض أُرسلت أو سُلّمت أو قُرئت أو فشلت لكل رسالة. يتطلب باقة Gallabox تتضمن Webhooks (Essential أو Advanced). تُحفظ الحالة فقط، ولا يُحفظ النص أبدًا.",
  "hook.off": "شغّل \u201cحالة تسليم واتساب\u201d من الإدارة \u203a الميزات أولًا.",
  "hook.create": "أنشئ رابط Webhook",
  "hook.rotate": "استبدل الرابط والسر",
  "hook.url": "رابط Webhook",
  "hook.secret": "السر (يظهر مرة واحدة)",
  "hook.steps":
    "في Gallabox \u203a الإعدادات \u203a Webhooks: أضف هذا الرابط مع الحدثين Message.WA.Status.Received وMessage.WA.Status.Failed، والصق السر.",
  "hook.ready": "تم ضبط رابط Webhook. استبدله إن فُقد السر.",
};

export const WHATSAPP_TEXT: Record<Locale, Record<WhatsAppKey, string>> = { en, ar };

export function useWhatsAppText(): (key: WhatsAppKey, vars?: Record<string, string>) => string {
  const { locale } = useI18n();
  return (key, vars) =>
    Object.entries(vars ?? {}).reduce(
      (s, [k, v]) => s.split(`{${k}}`).join(v),
      WHATSAPP_TEXT[locale][key] as string,
    );
}
