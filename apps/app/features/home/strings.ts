/**
 * Home strings added by wave 3 (D-058): kept here, not in lib/i18n.ts, which another stream
 * owns this wave. English and Arabic in step (pattern of features/email/strings.ts).
 */
import type { Locale, Vars } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";

const en = {
  /** D-073: the first-run step that opens the practice call. */
  "setup.practice": "Try a practice call",
  /** UX-014: the Setup guide for every role (it said "Setup guide (admin)"). */
  "guide.title": "Setup guide",
  "guide.intro": "Check each step below, run a quick test, or jump straight to Fix it.",
  "guide.test": "Test it",
  "guide.testing": "Testing…",
  "guide.fix": "Fix it",
  "guide.recommended": "Recommended default: {value}",
  /** After Test it: the step's status line, then the result. */
  "guide.verified": "{status} (verified)",
  "guide.incomplete": "{status} — open Fix it to complete.",
  // The Setup guide's steps (features/home/setup.ts): title, what it does, recommended default,
  // and the status line when done (.on) or not (.off).
  "guide.zoho.title": "Zoho CRM",
  "guide.zoho.what": "Pulls customer context before each call and logs approved notes after.",
  "guide.zoho.default": "Connected per agent",
  "guide.zoho.on": "Zoho: connected ✓",
  "guide.zoho.off": "Zoho: not set up",
  "guide.audio.title": "Microphone & call audio",
  "guide.audio.what": "Verifies customer audio is captured separately from your microphone.",
  "guide.audio.default": "Separate customer & agent tracks",
  "guide.audio.on": "Audio: ready ✓",
  "guide.audio.off": "Audio: not tested yet",
  "guide.practice.title": "Practice call",
  "guide.practice.what":
    "Runs a 30-second scripted call so you can see live cards before calling a customer.",
  "guide.practice.default": "Recommended once before first live call",
  "guide.practice.on": "Practice: completed ✓",
  "guide.practice.off": "Practice: not tried yet",
  "guide.playbook.title": "Sales playbook",
  "guide.playbook.what":
    "Gives instant, company-approved answers to pricing and objection questions.",
  "guide.playbook.default": "At least 5 top FAQ & objection entries",
  "guide.playbook.on": "Playbook: {n} entries ready ✓",
  "guide.playbook.on.one": "Playbook: 1 entry ready ✓",
  "guide.playbook.off": "Playbook: empty",
  "guide.invite.title": "Team seats",
  "guide.invite.what":
    "Invites your sales agents and managers; each sees only what their role allows.",
  "guide.invite.default": "Invite active reps before rollout",
  /** Shown from 2 seats on, so it needs no ".one" form. */
  "guide.invite.on": "Team: {n} seats active ✓",
  "guide.invite.off": "Team: only 1 seat so far",
  "guide.messaging.title": "Email & WhatsApp",
  "guide.messaging.what":
    "Connects your approved sender and WhatsApp templates for post-call follow-ups.",
  "guide.messaging.default": "Connected with approved templates",
  "guide.messaging.on": "WhatsApp / Email: connected ✓",
  "guide.messaging.off": "WhatsApp / Email: not set up",
} as const;

export type HomeTextKey = keyof typeof en;

/** Arabic status lines start with an Arabic word: on the web a line that starts with "Zoho" is
 * laid out left to right. Counts follow "عدد" ("number of"), so one wording fits every number. */
const ar: Record<HomeTextKey, string> = {
  "setup.practice": "جرّب مكالمة تدريبية",
  "guide.title": "دليل الإعداد",
  "guide.intro": "راجع كل خطوة أدناه، أو شغّل اختبارًا سريعًا، أو انتقل مباشرة إلى «أصلحها».",
  "guide.test": "اختبرها",
  "guide.testing": "جارٍ الاختبار…",
  "guide.fix": "أصلحها",
  "guide.recommended": "الإعداد الموصى به: {value}",
  "guide.verified": "{status} (تم التحقق)",
  "guide.incomplete": "{status} — افتح «أصلحها» لإكمال الخطوة.",
  "guide.zoho.title": "Zoho CRM",
  "guide.zoho.what": "يجلب معلومات العميل قبل كل مكالمة، ويسجّل الملاحظات المعتمدة بعدها.",
  "guide.zoho.default": "يربط كل مندوب حسابه الخاص",
  "guide.zoho.on": "حساب Zoho: متصل ✓",
  "guide.zoho.off": "حساب Zoho: غير متصل",
  "guide.audio.title": "الميكروفون وصوت المكالمة",
  "guide.audio.what": "يتحقق من التقاط صوت العميل منفصلًا عن ميكروفونك.",
  "guide.audio.default": "مسار مستقل لكلٍّ من العميل والمندوب",
  "guide.audio.on": "الصوت: جاهز ✓",
  "guide.audio.off": "الصوت: لم يُختبر بعد",
  "guide.practice.title": "مكالمة تدريبية",
  "guide.practice.what":
    "يشغّل مكالمة مكتوبة مسبقًا مدتها 30 ثانية، فترى البطاقات كما تظهر أثناء المكالمة قبل أن تتصل بعميل.",
  "guide.practice.default": "مرة واحدة قبل أول مكالمة حقيقية",
  "guide.practice.on": "التدريب: مكتمل ✓",
  "guide.practice.off": "التدريب: لم يُجرَّب بعد",
  "guide.playbook.title": "دليل المبيعات",
  "guide.playbook.what": "يقدّم إجابات فورية تعتمدها شركتك لأسئلة الأسعار والاعتراضات.",
  "guide.playbook.default": "5 إجابات على الأقل لأكثر الأسئلة والاعتراضات تكرارًا",
  "guide.playbook.on": "الدليل: عدد الإجابات {n} ✓",
  "guide.playbook.on.one": "الدليل: إجابة واحدة جاهزة ✓",
  "guide.playbook.off": "الدليل: فارغ",
  "guide.invite.title": "مقاعد الفريق",
  "guide.invite.what": "يدعو مندوبي المبيعات والمديرين، ولا يرى كلٌّ منهم إلا ما يسمح به دوره.",
  "guide.invite.default": "ادعُ المندوبين النشطين قبل بدء الاستخدام",
  "guide.invite.on": "الفريق: عدد المقاعد النشطة {n} ✓",
  "guide.invite.off": "الفريق: مقعد واحد فقط حتى الآن",
  "guide.messaging.title": "البريد وواتساب",
  "guide.messaging.what": "يربط عنوان المرسل المعتمد وقوالب واتساب لرسائل المتابعة بعد المكالمة.",
  "guide.messaging.default": "متصل بقوالب معتمدة",
  "guide.messaging.on": "البريد أو واتساب: متصل ✓",
  "guide.messaging.off": "البريد أو واتساب: غير متصل",
};

export const HOME_TEXT: Record<Locale, Record<HomeTextKey, string>> = { en, ar };

/** A Home string and the values for its `{name}` placeholders. */
export type HomePhrase = { key: HomeTextKey; vars?: Vars };

export const isHomeKey = (key: string): key is HomeTextKey => key in en;

export function useHomeText(): (key: HomeTextKey, vars?: Vars) => string {
  const { locale } = useI18n();
  return (key, vars) =>
    (HOME_TEXT[locale][key] ?? en[key]).replace(/\{(\w+)\}/g, (m, name: string) =>
      vars && name in vars ? String(vars[name]) : m,
    );
}
