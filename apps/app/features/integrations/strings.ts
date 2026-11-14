/**
 * Strings for the wave-3 Integrations work (UX-30, UX-32, ZC-07, ZC-13, UX-44c). English and
 * Arabic in step; kept here, not in lib/i18n.ts (D-058).
 */
import type { Locale } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";

const en = {
  // UX-30: the Zoho OAuth client is an owner-console override now (D-064).
  "zoho.override.title": "Your organisation's own Zoho client",
  "zoho.override.body": "AGN set a Zoho OAuth client just for your organisation.",
  "zoho.override.tail": "Client ID ends …{tail}",
  "zoho.override.remove": "Remove your organisation's client (use AGN's)",
  "zoho.override.confirm": "Remove it? Everyone in your organisation will connect Zoho again.",
  "zoho.override.yes": "Yes, remove it",
  "zoho.override.no": "Keep it",
  "zoho.override.removed": "Removed. Your organisation now uses AGN's Zoho client.",
  // UX-32
  "smtp.preset.found": "{provider} found for {domain}. Enter the mailbox password to finish.",
  "smtp.preset.other": "We could not tell who hosts mail for {domain}. Fill in your mail server.",
  "smtp.preset.pick": "Mail provider",
  "smtp.preset.advanced": "Server settings",
  "smtp.saveAndTest": "Save and send a test email",
  "smtp.why.password": "Enter the mailbox password first",
  "smtp.why.host": "Enter the mail server first",
  "smtp.why.from": "Enter the sender name and address first",
  "smtp.why.username": "Enter the mailbox login first",
  "smtp.why.busy": "Saving…",
  "smtp.why.test": "Save a mailbox first",
  // ZC-07
  "gallabox.channel.title": "WhatsApp number",
  "gallabox.channel.pick": "Pick the number agents send from",
  "gallabox.channel.one": "Sending from {label}",
  "gallabox.channel.none":
    "No number found in your templates. Enter the channel ID from Gallabox › Settings.",
  "gallabox.channel.manual": "Enter the channel ID by hand",
  "gallabox.templates.found":
    "{count} approved templates found. Untick any agents should not send.",
  "gallabox.templates.hidden": "{count} more wait for WhatsApp approval and are not shown.",
  "gallabox.templates.none": "No approved templates yet. Create one in Gallabox, then load again.",
  "gallabox.templates.reload": "Load again",
  "gallabox.map.title": "Fill {param} from",
  "gallabox.map.typed": "The agent types it",
  "gallabox.why.keys": "Enter the API key, secret and account ID first",
  "gallabox.why.changed": "Change a field first",
  "gallabox.why.load": "Save the keys first",
  "gallabox.why.pick": "Tick at least one template",
  "source.customer.first_name": "Customer first name",
  "source.customer.name": "Customer full name",
  "source.customer.phone": "Customer phone",
  "source.agent.name": "Agent name",
  "source.agent.first_name": "Agent first name",
  "source.company.name": "Your company name",
  "source.meeting.date": "Meeting date",
  "source.meeting.time": "Meeting time",
  "source.meeting.place": "Meeting place",
  "source.deal.name": "Deal name",
  // ZC-13
  "zohoTeam.title": "Invite your team from Zoho CRM",
  "zohoTeam.body":
    "Everyone with a Zoho CRM user in a sales role, invited as agents. Nothing is sent until you confirm.",
  "zohoTeam.load": "Find people in Zoho",
  "zohoTeam.loading": "Reading Zoho…",
  "zohoTeam.fallback": "No sales roles in Zoho, so everyone except administrators is listed.",
  "zohoTeam.seats": "{left} seats left",
  "zohoTeam.member": "Already on the team",
  "zohoTeam.manager": "Manager",
  "zohoTeam.agent": "Agent",
  "zohoTeam.invite": "Invite {count}",
  "zohoTeam.why.none": "Tick at least one person",
  "zohoTeam.why.seats": "Untick some: only {left} seats left",
  "zohoTeam.done":
    "Invited {count}. Give each person their one-time password; they change it at first sign-in.",
  "zohoTeam.empty": "Nobody new to invite from Zoho.",
  "zohoTeam.connect": "Connect your Zoho account above first.",
  "zohoTeam.failed": "Could not read Zoho: {error}",
} as const;

export type IntegrationsKey = keyof typeof en;

const ar: Record<IntegrationsKey, string> = {
  "zoho.override.title": "عميل Zoho الخاص بمؤسستك",
  "zoho.override.body": "ضبطت AGN عميل Zoho OAuth خاصًا بمؤسستك.",
  "zoho.override.tail": "معرّف العميل ينتهي بـ …{tail}",
  "zoho.override.remove": "إزالة عميل مؤسستك (استخدام عميل AGN)",
  "zoho.override.confirm": "هل تريد إزالته؟ سيعيد الجميع في مؤسستك ربط Zoho.",
  "zoho.override.yes": "نعم، أزله",
  "zoho.override.no": "أبقِه",
  "zoho.override.removed": "أُزيل. تستخدم مؤسستك الآن عميل Zoho الخاص بـ AGN.",
  "smtp.preset.found": "وجدنا {provider} للنطاق {domain}. أدخل كلمة مرور صندوق البريد للإكمال.",
  "smtp.preset.other": "لم نعرف من يستضيف بريد {domain}. أدخل بيانات خادم البريد.",
  "smtp.preset.pick": "مزوّد البريد",
  "smtp.preset.advanced": "إعدادات الخادم",
  "smtp.saveAndTest": "احفظ وأرسل رسالة تجريبية",
  "smtp.why.password": "أدخل كلمة مرور صندوق البريد أولًا",
  "smtp.why.host": "أدخل خادم البريد أولًا",
  "smtp.why.from": "أدخل اسم المرسل وعنوانه أولًا",
  "smtp.why.username": "أدخل اسم دخول صندوق البريد أولًا",
  "smtp.why.busy": "جارٍ الحفظ…",
  "smtp.why.test": "احفظ صندوق بريد أولًا",
  "gallabox.channel.title": "رقم واتساب",
  "gallabox.channel.pick": "اختر الرقم الذي يرسل منه الوكلاء",
  "gallabox.channel.one": "الإرسال من {label}",
  "gallabox.channel.none": "لم نجد رقمًا في قوالبك. أدخل معرّف القناة من Gallabox › الإعدادات.",
  "gallabox.channel.manual": "أدخل معرّف القناة يدويًا",
  "gallabox.templates.found": "وُجد {count} قالبًا معتمدًا. ألغِ تحديد ما لا يجب أن يرسله الوكلاء.",
  "gallabox.templates.hidden": "{count} أخرى بانتظار موافقة واتساب ولا تظهر.",
  "gallabox.templates.none": "لا توجد قوالب معتمدة بعد. أنشئ قالبًا في Gallabox ثم حمّل مجددًا.",
  "gallabox.templates.reload": "حمّل مجددًا",
  "gallabox.map.title": "املأ {param} من",
  "gallabox.map.typed": "يكتبه الوكيل",
  "gallabox.why.keys": "أدخل مفتاح API والسر ومعرّف الحساب أولًا",
  "gallabox.why.changed": "غيّر حقلًا أولًا",
  "gallabox.why.load": "احفظ المفاتيح أولًا",
  "gallabox.why.pick": "حدّد قالبًا واحدًا على الأقل",
  "source.customer.first_name": "الاسم الأول للعميل",
  "source.customer.name": "الاسم الكامل للعميل",
  "source.customer.phone": "هاتف العميل",
  "source.agent.name": "اسم الوكيل",
  "source.agent.first_name": "الاسم الأول للوكيل",
  "source.company.name": "اسم شركتك",
  "source.meeting.date": "تاريخ الاجتماع",
  "source.meeting.time": "وقت الاجتماع",
  "source.meeting.place": "مكان الاجتماع",
  "source.deal.name": "اسم الصفقة",
  "zohoTeam.title": "ادعُ فريقك من Zoho CRM",
  "zohoTeam.body": "كل من لديه مستخدم في Zoho CRM بدور مبيعات، يُدعى كوكيل. لا يُرسل شيء قبل تأكيدك.",
  "zohoTeam.load": "ابحث عن الأشخاص في Zoho",
  "zohoTeam.loading": "جارٍ القراءة من Zoho…",
  "zohoTeam.fallback": "لا توجد أدوار مبيعات في Zoho، لذا يظهر الجميع عدا المسؤولين.",
  "zohoTeam.seats": "{left} مقاعد متبقية",
  "zohoTeam.member": "في الفريق بالفعل",
  "zohoTeam.manager": "مدير",
  "zohoTeam.agent": "وكيل",
  "zohoTeam.invite": "ادعُ {count}",
  "zohoTeam.why.none": "حدّد شخصًا واحدًا على الأقل",
  "zohoTeam.why.seats": "ألغِ تحديد بعضهم: تبقّى {left} مقاعد فقط",
  "zohoTeam.done": "دُعي {count}. أعطِ كل شخص كلمة المرور المؤقتة؛ يغيّرها عند أول دخول.",
  "zohoTeam.empty": "لا يوجد أحد جديد لدعوته من Zoho.",
  "zohoTeam.connect": "اربط حساب Zoho الخاص بك أعلاه أولًا.",
  "zohoTeam.failed": "تعذّرت القراءة من Zoho: {error}",
};

export const INTEGRATIONS_TEXT: Record<Locale, Record<IntegrationsKey, string>> = { en, ar };

export function useIntegrationsText(): (
  key: IntegrationsKey,
  vars?: Record<string, string>,
) => string {
  const { locale } = useI18n();
  return (key, vars) =>
    (INTEGRATIONS_TEXT[locale][key] ?? en[key]).replace(/\{(\w+)\}/g, (m, k: string) =>
      vars && k in vars ? String(vars[k]) : m,
    );
}
