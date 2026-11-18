/**
 * Strings for org email (D-032, D-039): `integrations.smtp.*` (Admin → Integrations) and
 * `email.*` (the post-call email). English and Arabic in step. Kept here, not in lib/i18n.ts,
 * so this work merges cleanly with the reskin (same pattern as features/flags/strings.ts).
 */
import type { Locale } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";

const en = {
  "integrations.smtp.title": "Email (SMTP)",
  "integrations.smtp.body":
    "Your organisation's mailbox for follow-up emails. The username and password are encrypted on the server and never shown again.",
  "integrations.smtp.active.org": "Using your mailbox",
  "integrations.smtp.active.platform": "Using AGN's mailbox (add yours to send as your company)",
  "integrations.smtp.active.none": "No mailbox yet",
  "integrations.smtp.host": "SMTP server",
  "integrations.smtp.port": "Port",
  "integrations.smtp.port.465": "465 · SSL",
  "integrations.smtp.port.587": "587 · STARTTLS",
  "integrations.smtp.username": "Username",
  "integrations.smtp.password": "Password",
  "integrations.smtp.kept": "Saved · leave empty to keep",
  "integrations.smtp.fromName": "From name",
  "integrations.smtp.fromAddress": "From address",
  "integrations.smtp.save": "Save mailbox",
  "integrations.smtp.remove": "Remove",
  "integrations.smtp.saved": "Saved.",
  "integrations.smtp.failed": "Could not save: {error}",
  "integrations.smtp.test": "Send test email",
  "integrations.smtp.testing": "Sending…",
  "integrations.smtp.testOk": "Test email sent to {to}. Check that inbox.",
  "integrations.smtp.testFailed": "The mail server said: {error}",
  "integrations.smtp.formats.title": "Email formats",
  "integrations.smtp.formats.body":
    "The opening and signature are sent exactly as written. Use the toolbar for bold, italic, lists and links — the email is sent with the formatting applied. Placeholders: {{customer.name}}, {{agent.name}}, {{agent.email}}, {{company.name}}.",
  "integrations.smtp.formats.name": "Name",
  "integrations.smtp.formats.subject": "Subject",
  "integrations.smtp.formats.opening": "Opening (fixed)",
  "integrations.smtp.formats.example": "Example body",
  "integrations.smtp.formats.signature": "Signature (fixed)",
  "integrations.smtp.formats.save": "Save formats",
  "email.title": "Send email",
  "email.unavailable": "Email sending is not set up for your organisation.",
  "email.from": "From",
  "email.format": "Format",
  "email.to": "To",
  "email.cc": "CC",
  "email.addresses": "Separate addresses with commas",
  "email.customer": "Customer name",
  "email.subject": "Subject",
  "email.body": "Message",
  "email.useDraft": "Use the follow-up draft",
  "email.preview": "Preview",
  "email.previewTitle": "This is exactly what will be sent",
  "email.edit": "Edit",
  "email.confirm": "Confirm and send",
  "email.sending": "Sending…",
  "email.sent": "Sent to {to}.",
  "email.duplicate": "Already sent; not sent again.",
  "email.failed": "Not sent: {error}",
  "email.another": "Write another",
  "email.warnAttached":
    "The message mentions an attachment, but nothing is attached. Add a link or change the text.",
  "email.warnPlaceholder": "Fill in {items} before sending.",
  "email.attachments": "Attach files from your admin's list",
  "email.attachedFiles": "Attached: {files}",
  "att.title": "Email attachments",
  "att.hint":
    "Files your agents can add to follow-up emails. Agents pick from this list; they cannot upload.",
  "att.none": "No files yet",
  "att.add": "Add a file",
  "att.uploading": "Uploading…",
  "att.delete": "Delete",
  "att.deleteOne": "Delete {name}",
  "att.tooBig": "Files can be at most 5 MB.",
  "att.limits":
    "PDF, PNG, JPEG, Word, Excel or PowerPoint. Up to 5 MB each, 20 files, 25 MB in all.",
  "att.desktopOnly": "Add files from the desktop app or the web.",
} as const;

export type EmailKey = keyof typeof en;

const ar: Record<EmailKey, string> = {
  "integrations.smtp.title": "البريد الإلكتروني (SMTP)",
  "integrations.smtp.body":
    "صندوق بريد مؤسستك لرسائل المتابعة. يُشفَّر اسم المستخدم وكلمة المرور على الخادم ولا يُعرضان مرة أخرى.",
  "integrations.smtp.active.org": "يُستخدم صندوق بريدكم",
  "integrations.smtp.active.platform": "يُستخدم صندوق بريد AGN (أضف صندوقك للإرسال باسم شركتك)",
  "integrations.smtp.active.none": "لا يوجد صندوق بريد بعد",
  "integrations.smtp.host": "خادم SMTP",
  "integrations.smtp.port": "المنفذ",
  "integrations.smtp.port.465": "465 · SSL",
  "integrations.smtp.port.587": "587 · STARTTLS",
  "integrations.smtp.username": "اسم المستخدم",
  "integrations.smtp.password": "كلمة المرور",
  "integrations.smtp.kept": "محفوظ · اتركه فارغًا للإبقاء عليه",
  "integrations.smtp.fromName": "اسم المرسل",
  "integrations.smtp.fromAddress": "عنوان المرسل",
  "integrations.smtp.save": "حفظ صندوق البريد",
  "integrations.smtp.remove": "إزالة",
  "integrations.smtp.saved": "تم الحفظ.",
  "integrations.smtp.failed": "تعذّر الحفظ: {error}",
  "integrations.smtp.test": "إرسال رسالة تجريبية",
  "integrations.smtp.testing": "جارٍ الإرسال…",
  "integrations.smtp.testOk": "أُرسلت رسالة تجريبية إلى {to}. تحقّق من ذلك الصندوق.",
  "integrations.smtp.testFailed": "رد خادم البريد: {error}",
  "integrations.smtp.formats.title": "قوالب البريد",
  "integrations.smtp.formats.body":
    "تُرسل التحية والتوقيع كما كُتبا تمامًا. استخدم شريط الأدوات للخط العريض والمائل والقوائم والروابط — يُرسل البريد مع تطبيق التنسيق. العناصر النائبة: {{customer.name}}، {{agent.name}}، {{agent.email}}، {{company.name}}.",
  "integrations.smtp.formats.name": "الاسم",
  "integrations.smtp.formats.subject": "الموضوع",
  "integrations.smtp.formats.opening": "التحية (ثابتة)",
  "integrations.smtp.formats.example": "نص مثال",
  "integrations.smtp.formats.signature": "التوقيع (ثابت)",
  "integrations.smtp.formats.save": "حفظ القوالب",
  "email.title": "إرسال بريد إلكتروني",
  "email.unavailable": "إرسال البريد غير مُعدّ لمؤسستك.",
  "email.from": "من",
  "email.format": "القالب",
  "email.to": "إلى",
  "email.cc": "نسخة",
  "email.addresses": "افصل العناوين بفواصل",
  "email.customer": "اسم العميل",
  "email.subject": "الموضوع",
  "email.body": "الرسالة",
  "email.useDraft": "استخدم مسودة المتابعة",
  "email.preview": "معاينة",
  "email.previewTitle": "هذا بالضبط ما سيُرسل",
  "email.edit": "تعديل",
  "email.confirm": "تأكيد وإرسال",
  "email.sending": "جارٍ الإرسال…",
  "email.sent": "أُرسلت إلى {to}.",
  "email.duplicate": "أُرسلت سابقًا؛ لم تُرسل مرة أخرى.",
  "email.failed": "لم تُرسل: {error}",
  "email.another": "كتابة رسالة أخرى",
  "email.warnAttached": "تذكر الرسالة مرفقًا، لكن لا يوجد مرفق. أضف رابطًا أو غيّر النص.",
  "email.attachments": "أرفق ملفات من قائمة المسؤول",
  "email.attachedFiles": "المرفقات: {files}",
  "att.title": "مرفقات البريد",
  "att.hint":
    "ملفات يمكن للوكلاء إضافتها إلى بريد المتابعة. يختار الوكلاء من هذه القائمة ولا يمكنهم الرفع.",
  "att.none": "لا توجد ملفات بعد",
  "att.add": "أضف ملفًا",
  "att.uploading": "جارٍ الرفع…",
  "att.delete": "حذف",
  "att.deleteOne": "حذف {name}",
  "att.tooBig": "الحد الأقصى للملف 5 ميغابايت.",
  "att.limits":
    "PDF أو PNG أو JPEG أو Word أو Excel أو PowerPoint. حتى 5 ميغابايت للملف، و20 ملفًا، و25 ميغابايت إجمالًا.",
  "att.desktopOnly": "أضف الملفات من تطبيق سطح المكتب أو الويب.",
  "email.warnPlaceholder": "املأ {items} قبل الإرسال.",
};

export const EMAIL_TEXT: Record<Locale, Record<EmailKey, string>> = { en, ar };

export function useEmailText(): (key: EmailKey, vars?: Record<string, string>) => string {
  const { locale } = useI18n();
  return (key, vars) =>
    Object.entries(vars ?? {}).reduce(
      (s, [k, v]) => s.split(`{${k}}`).join(v),
      EMAIL_TEXT[locale][key] as string,
    );
}
