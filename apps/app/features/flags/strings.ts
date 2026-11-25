/**
 * Strings for feature flags (D-028), English and Arabic in step. Kept here, not in lib/i18n.ts,
 * so this work merges cleanly with the reskin; move them into i18n.ts whenever convenient.
 */
import type { Locale } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";
import type { Effective, FeatureId } from "./catalog";

type Text = {
  name: Record<FeatureId, string>;
  about: Record<FeatureId, string>;
  state: Record<Effective["state"], string>;
  reason: {
    platform: string;
    org: string;
    orgAdmin: string;
    release: string;
    zoho: string;
    gallabox: string;
    email_sender: string;
    connection: string;
    dependency: string;
  };
  action: { features: string; settings: string };
  admin: {
    title: string;
    subtitle: string;
    for: string;
    roles: Record<"admin" | "manager" | "agent", string>;
    saved: string;
    failed: string;
    loadFailed: string;
    noServer: string;
  };
};

const en: Text = {
  name: {
    call_review: "Call review",
    follow_up: "Follow-up email",
    recordings: "Call recordings",
    reports: "Reports",
    ai_knowledge: "AI knowledge",
    integrations: "Integrations",
    zoho: "Zoho CRM",
    gallabox: "Gallabox",
    email_send: "Send email",
    whatsapp: "WhatsApp messages",
    prep: "Call prep",
    card_ratings: "Card ratings",
    learned_instructions: "Learned instructions",
    followup_plan: "Follow-up plan",
    meeting_reminders: "Meeting reminders",
    whatsapp_status: "WhatsApp delivery status",
    zoho_watch: "Zoho change alerts",
    email_attachments: "Email attachments",
    playbook_bootstrap: "Playbook drafts",
    call_logs_github: "Automatic call logs (GitHub)",
    local_models_text: "Local text models",
    local_models_voice: "Local voice models",
    setup_guide: "Setup guide",
  },
  about: {
    call_review: "Scores and coaching after each call.",
    follow_up: "Drafts the email to the customer after the call.",
    recordings: "Keeps call audio so managers can listen later.",
    reports: "Calls, scores and trends for the team.",
    ai_knowledge: "What the AI knows about your company on every call.",
    integrations: "Connections to other tools.",
    zoho: "Meetings, contacts and deals from Zoho before and after calls.",
    gallabox: "Your WhatsApp Business account through Gallabox.",
    email_send: "Sends approved follow-up emails from the app.",
    whatsapp: "Sends approved WhatsApp templates after calls.",
    prep: "A short brief before each call.",
    card_ratings: "Agents rate AI cards to improve them.",
    learned_instructions: "Short rules learned from card ratings.",
    followup_plan: "Reminds the agent at each follow-up step; nothing is sent without a tap.",
    meeting_reminders: "WhatsApp reminder before a booked meeting, one tap each.",
    whatsapp_status:
      "Shows sent, delivered, read or failed for each message. Needs Gallabox webhooks.",
    zoho_watch: "Updates the call brief when the deal or meeting changes in Zoho.",
    email_attachments: "Files your admin approved, added to follow-up emails.",
    playbook_bootstrap:
      "Drafts playbook answers from your website, Zoho or a document, for review.",
    call_logs_github: "Posts redacted call diagnostics to the owner's private GitHub repo.",
    local_models_text: "Allows connecting a local OpenAI-compatible text model endpoint.",
    local_models_voice: "Allows connecting local speech-to-text and text-to-speech endpoints.",
    setup_guide: "Step-by-step setup checklist with live status and Test it checks.",
  },
  state: {
    available: "On",
    off_by_platform: "Off by AGN",
    off_by_org: "Off for your organization",
    needs_connection: "Needs a connection",
    no_permission: "Not for this role",
  },
  reason: {
    platform: "Not included in your plan right now.",
    org: "Your admin turned this off.",
    orgAdmin: "Turned off for your organization.",
    release: "Coming in a later version.",
    zoho: "Connect Zoho CRM to use this.",
    gallabox: "Connect Gallabox to use this.",
    email_sender: "Add an approved sender to use this.",
    connection: "Needs a connection first.",
    dependency: "Needs {feature} first.",
  },
  action: { features: "Open Features", settings: "Open Settings" },
  admin: {
    title: "Features",
    subtitle:
      "Turn features on or off for everyone in your organization. A switch that is off and locked is switched off by AGN; the reason is under it.",
    for: "For",
    roles: { admin: "Admins", manager: "Managers", agent: "Agents" },
    saved: "Saved.",
    failed: "Could not save. Try again.",
    loadFailed: "Could not load features. Check your connection.",
    noServer: "Features are managed on your organization's Sales Shield server.",
  },
};

const ar: Text = {
  name: {
    call_review: "مراجعة المكالمة",
    follow_up: "بريد المتابعة",
    recordings: "تسجيلات المكالمات",
    reports: "التقارير",
    ai_knowledge: "معرفة الذكاء الاصطناعي",
    integrations: "التكاملات",
    zoho: "Zoho CRM",
    gallabox: "Gallabox",
    email_send: "إرسال البريد",
    whatsapp: "رسائل واتساب",
    prep: "التحضير للمكالمة",
    card_ratings: "تقييم البطاقات",
    learned_instructions: "التعليمات المكتسبة",
    followup_plan: "خطة المتابعة",
    meeting_reminders: "تذكيرات الاجتماعات",
    whatsapp_status: "حالة تسليم واتساب",
    zoho_watch: "تنبيهات تغييرات Zoho",
    email_attachments: "مرفقات البريد",
    playbook_bootstrap: "مسودات دليل المبيعات",
    call_logs_github: "سجلات المكالمات التلقائية (GitHub)",
    local_models_text: "النماذج النصية المحلية",
    local_models_voice: "النماذج الصوتية المحلية",
    setup_guide: "دليل الإعداد",
  },
  about: {
    call_review: "تقييم وتوجيه بعد كل مكالمة.",
    follow_up: "يكتب مسودة بريد للعميل بعد المكالمة.",
    recordings: "يحفظ صوت المكالمة ليستمع إليه المديرون لاحقًا.",
    reports: "المكالمات والتقييمات والاتجاهات للفريق.",
    ai_knowledge: "ما يعرفه الذكاء الاصطناعي عن شركتك في كل مكالمة.",
    integrations: "الربط مع أدوات أخرى.",
    zoho: "الاجتماعات وجهات الاتصال والصفقات من Zoho قبل المكالمات وبعدها.",
    gallabox: "حساب واتساب للأعمال عبر Gallabox.",
    email_send: "يرسل رسائل المتابعة المعتمدة من التطبيق.",
    whatsapp: "يرسل قوالب واتساب المعتمدة بعد المكالمات.",
    prep: "ملخص قصير قبل كل مكالمة.",
    card_ratings: "يقيّم الموظفون بطاقات الذكاء الاصطناعي لتحسينها.",
    learned_instructions: "قواعد قصيرة مستفادة من تقييم البطاقات.",
    followup_plan: "يذكّر الوكيل بكل خطوة متابعة؛ لا يُرسل شيء دون نقرة.",
    meeting_reminders: "تذكير واتساب قبل الاجتماع المحجوز، بنقرة لكل تذكير.",
    whatsapp_status:
      "يعرض مُرسلة أو مُسلّمة أو مقروءة أو فاشلة لكل رسالة. يتطلب Webhooks في Gallabox.",
    zoho_watch: "يحدّث ملخص المكالمة عند تغيّر الصفقة أو الاجتماع في Zoho.",
    email_attachments: "ملفات اعتمدها المسؤول تُضاف إلى بريد المتابعة.",
    playbook_bootstrap: "يصوغ إجابات لدليل المبيعات من موقعك أو Zoho أو مستند، للمراجعة.",
    call_logs_github: "يرسل تشخيصات المكالمات المنقحة إلى مستودع GitHub الخاص بالمالك.",
    local_models_text: "يتيح الاتصال بنقطة نهاية نموذج نصي محلي متوافق مع OpenAI.",
    local_models_voice: "يتيح الاتصال بخوادم التحويل الصوتي المحلية.",
    setup_guide: "قائمة إعداد خطوة بخطوة مع الحالة المباشرة واختبار الإعداد.",
  },
  state: {
    available: "مفعّلة",
    off_by_platform: "أوقفتها AGN",
    off_by_org: "متوقفة لمؤسستك",
    needs_connection: "تحتاج إلى ربط",
    no_permission: "غير متاحة لهذا الدور",
  },
  reason: {
    platform: "غير مشمولة في خطتك حاليًا.",
    org: "أوقف المسؤول هذه الميزة.",
    orgAdmin: "متوقفة لمؤسستك.",
    release: "تتوفر في إصدار لاحق.",
    zoho: "اربط Zoho CRM لاستخدام هذه الميزة.",
    gallabox: "اربط Gallabox لاستخدام هذه الميزة.",
    email_sender: "أضف مرسلًا معتمدًا لاستخدام هذه الميزة.",
    connection: "تحتاج إلى ربط أولًا.",
    dependency: "تحتاج إلى {feature} أولًا.",
  },
  action: { features: "فتح الميزات", settings: "فتح الإعدادات" },
  admin: {
    title: "الميزات",
    subtitle:
      "فعّل الميزات أو أوقفها لكل من في مؤسستك. المفتاح المتوقف والمقفل أوقفته AGN، وسببه تحته.",
    for: "لـ",
    roles: { admin: "المسؤولون", manager: "المديرون", agent: "الموظفون" },
    saved: "تم الحفظ.",
    failed: "تعذّر الحفظ. حاول مرة أخرى.",
    loadFailed: "تعذّر تحميل الميزات. تحقق من الاتصال.",
    noServer: "تُدار الميزات على خادم Sales Shield الخاص بمؤسستك.",
  },
};

export const FLAG_TEXT: Record<Locale, Text> = { en, ar };

export function useFlagText(): Text {
  const { locale } = useI18n();
  return FLAG_TEXT[locale];
}

const FEATURE_CAUSES = new Set<string>(Object.keys(en.name));

/** The one-line reason shown under a greyed feature. */
export function reasonFor(text: Text, effective: Effective, admin: boolean): string {
  const cause = effective.cause;
  if (cause && FEATURE_CAUSES.has(cause) && effective.state !== "needs_connection") {
    return text.reason.dependency.replace("{feature}", text.name[cause as FeatureId]);
  }
  switch (effective.state) {
    case "off_by_platform":
      return text.reason.platform;
    case "off_by_org":
      return admin ? text.reason.orgAdmin : text.reason.org;
    case "needs_connection":
      if (cause === "release") return text.reason.release;
      if (cause === "zoho" || cause === "gallabox" || cause === "email_sender") {
        return text.reason[cause];
      }
      if (cause && FEATURE_CAUSES.has(cause)) {
        return text.reason.dependency.replace("{feature}", text.name[cause as FeatureId]);
      }
      return text.reason.connection;
    default:
      return "";
  }
}
