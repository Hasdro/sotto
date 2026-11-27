/**
 * Live-call strings added by the review round (T-072, D-058): kept here, not in lib/i18n.ts,
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
  /** UX-20 (T-075): one start screen, one verb. */
  "start.title": "Start listening to a call",
  "start.detected": "{app} call detected",
  "start.detectedAny": "Call detected",
  "start.detectedBody":
    "Sales Shield hears the customer through the call's sound and you through the microphone, each on its own track.",
  "start.micBody":
    "No call app is running. For an in-person or speakerphone call, Sales Shield listens through the microphone; it may hear you too.",
  "start.webBody": "Sales Shield listens through the microphone. It may hear you too.",
  "start.listen": "Start listening",
  "start.useMic": "Start listening with the microphone instead",
  "start.useComputer": "Start listening to this computer's sound",
  "start.watching": "Watching for Zoom, Teams, Meet, 3CX, Yeastar and more",
  /** UX-21: desktop permission copy and the button to the exact OS pane. */
  "perm.systemAudioMac":
    "Allow Sales Shield to record system audio: System Settings › Privacy & Security › Screen & System Audio Recording. Then press Resume.",
  "perm.micMac":
    "Allow Sales Shield to use the microphone: System Settings › Privacy & Security › Microphone. Then press Resume.",
  "perm.micWindows":
    "Allow Sales Shield to use the microphone: Settings › Privacy & security › Microphone, and turn on access for desktop apps. Then press Resume.",
  "perm.noMicDesktop":
    "Sales Shield cannot find a microphone on this computer. Plug one in, then press Resume.",
  "perm.openMac": "Open System Settings",
  "perm.openWindows": "Open Windows Settings",
  /** ZC-08: the 5-second audio check. */
  "check.open": "Test audio",
  "check.title": "Test your audio",
  "check.body":
    "For 5 seconds, say hello and play any sound on this computer, like a video. Each side is checked on its own track.",
  "check.bodyWeb": "For 5 seconds, say hello.",
  "check.run": "Test audio",
  "check.running": "Listening for 5 seconds…",
  "check.you": "You (microphone)",
  "check.customer": "Customer (computer sound)",
  "check.ok": "Your audio is working.",
  "check.last": "Last check on this device: working.",
  "check.again": "Test again",
  "check.done": "Done",
  "check.fix.systemDenied":
    "Sales Shield cannot hear this computer's sound yet. Allow system audio recording for Sales Shield, then test again.",
  "check.fix.systemSilent":
    "No sound from this computer. Play a video or a song, turn the volume up, then test again.",
  "check.fix.micDenied":
    "Sales Shield cannot use the microphone yet. Allow it for Sales Shield, then test again.",
  "check.fix.micMissing": "No microphone found. Plug one in, then test again.",
  "check.fix.micSilent":
    "We heard nothing from your microphone. Check it is not muted, or pick another one in Settings.",
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
  /** D-073: practice call in a real account. */
  "practice.title": "Try a practice call",
  "practice.body":
    "A 30-second scripted call. You see the cards your team would get, from your own playbook. Nothing is saved, rated or sent.",
  "practice.start": "Start practice",
  "practice.open": "Try a practice call",
  "practice.real": "Start a real call instead",
  "practice.missing": "Practice calls arrive with the next server update.",
  "practice.ended": "Practice over. Nothing was saved to History or Reports.",
  /** PROD-002: one-click actions under the newest card, and the mini window in the header. */
  "card.copy": "Copy",
  "card.copied": "Copied",
  "card.copyShortcut": "{keys} from any app",
  "card.copyHint": "Copies the suggestion. Shortcut from any app: {keys}",
  /** UI-005: the insight toggle under the newest card. */
  "card.why": "Why?",
  "card.whyHide": "Hide insight",
  "mini.button": "Mini window",
  "mini.buttonHint": "Keeps the newest card on top of your other apps. Shortcut: {keys}",
  /** UX-006: a brief field filled in from the linked Zoho record. */
  "prep.prefilled": "From Zoho · edit freely",
  /** UX-008: narrow windows keep the context one tap away instead of opening it over the call. */
  "prep.ready": "Your call brief is ready.",
  "prep.readyLinked": "Your call brief is ready: {title}.",
  "prep.open": "View call context",
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
  "start.title": "ابدأ الاستماع إلى مكالمة",
  "start.detected": "تم اكتشاف مكالمة {app}",
  "start.detectedAny": "تم اكتشاف مكالمة",
  "start.detectedBody":
    "يسمع Sales Shield العميل عبر صوت المكالمة ويسمعك عبر الميكروفون، كلٌّ في مسار مستقل.",
  "start.micBody":
    "لا يوجد تطبيق مكالمات قيد التشغيل. في المكالمة وجهاً لوجه أو عبر مكبّر الصوت، يستمع Sales Shield عبر الميكروفون وقد يسمعك أيضاً.",
  "start.webBody": "يستمع Sales Shield عبر الميكروفون، وقد يسمعك أيضاً.",
  "start.listen": "ابدأ الاستماع",
  "start.useMic": "ابدأ الاستماع عبر الميكروفون بدلاً من ذلك",
  "start.useComputer": "ابدأ الاستماع إلى صوت هذا الكمبيوتر",
  "start.watching": "نراقب Zoom وTeams وMeet و3CX وYeastar والمزيد",
  "perm.systemAudioMac":
    "اسمح لـ Sales Shield بتسجيل صوت النظام: إعدادات النظام › الخصوصية والأمن › تسجيل الشاشة وصوت النظام. ثم اضغط «استئناف».",
  "perm.micMac":
    "اسمح لـ Sales Shield باستخدام الميكروفون: إعدادات النظام › الخصوصية والأمن › الميكروفون. ثم اضغط «استئناف».",
  "perm.micWindows":
    "اسمح لـ Sales Shield باستخدام الميكروفون: الإعدادات › الخصوصية والأمان › الميكروفون، وفعّل الوصول لتطبيقات سطح المكتب. ثم اضغط «استئناف».",
  "perm.noMicDesktop":
    "لا يجد Sales Shield ميكروفوناً على هذا الكمبيوتر. وصّل ميكروفوناً ثم اضغط «استئناف».",
  "perm.openMac": "افتح إعدادات النظام",
  "perm.openWindows": "افتح إعدادات Windows",
  "check.open": "اختبر الصوت",
  "check.title": "اختبر الصوت",
  "check.body":
    "لمدة 5 ثوانٍ، قل مرحباً وشغّل أي صوت على هذا الكمبيوتر، مثل فيديو. يُختبر كل طرف في مسار مستقل.",
  "check.bodyWeb": "لمدة 5 ثوانٍ، قل مرحباً.",
  "check.run": "اختبر الصوت",
  "check.running": "نستمع لمدة 5 ثوانٍ…",
  "check.you": "أنت (الميكروفون)",
  "check.customer": "العميل (صوت الكمبيوتر)",
  "check.ok": "الصوت يعمل.",
  "check.last": "آخر اختبار على هذا الجهاز: يعمل.",
  "check.again": "اختبر مرة أخرى",
  "check.done": "تم",
  "check.fix.systemSilent":
    "لا يوجد صوت من هذا الكمبيوتر. شغّل فيديو أو أغنية وارفع الصوت، ثم اختبر مرة أخرى.",
  "check.fix.systemDenied":
    "لا يستطيع Sales Shield سماع صوت هذا الكمبيوتر بعد. اسمح له بتسجيل صوت النظام، ثم اختبر مرة أخرى.",
  "check.fix.micDenied":
    "لا يستطيع Sales Shield استخدام الميكروفون بعد. اسمح له بذلك، ثم اختبر مرة أخرى.",
  "check.fix.micMissing": "لم يُعثر على ميكروفون. وصّل ميكروفوناً ثم اختبر مرة أخرى.",
  "check.fix.micSilent":
    "لم نسمع شيئاً من الميكروفون. تأكد أنه غير مكتوم، أو اختر غيره من الإعدادات.",
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
  "practice.title": "جرّب مكالمة تدريبية",
  "practice.body":
    "مكالمة مكتوبة مسبقًا مدتها 30 ثانية. ترى البطاقات التي سيحصل عليها فريقك من دليل شركتك. لا يُحفظ شيء ولا يُقيَّم ولا يُرسل.",
  "practice.start": "ابدأ التدريب",
  "practice.open": "جرّب مكالمة تدريبية",
  "practice.real": "ابدأ مكالمة حقيقية بدلًا من ذلك",
  "practice.missing": "المكالمات التدريبية تصل مع تحديث الخادم القادم.",
  "practice.ended": "انتهى التدريب. لم يُحفظ شيء في السجل أو التقارير.",
  "card.copy": "نسخ",
  "card.copied": "تم النسخ",
  "card.copyShortcut": "{keys} من أي تطبيق",
  "card.copyHint": "ينسخ الاقتراح. الاختصار من أي تطبيق: {keys}",
  "card.why": "لماذا؟",
  "card.whyHide": "إخفاء الفكرة",
  "mini.button": "النافذة الصغيرة",
  "mini.buttonHint": "تُبقي أحدث بطاقة فوق تطبيقاتك الأخرى. الاختصار: {keys}",
  "prep.prefilled": "من Zoho · يمكنك تعديله",
  "prep.ready": "ملخص مكالمتك جاهز.",
  "prep.readyLinked": "ملخص مكالمتك جاهز: {title}.",
  "prep.open": "اعرض سياق المكالمة",
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
