/**
 * "Who processes your calls" (DD-4, D-063): every legal sentence and the sub-processor list of the
 * consent step, in one data file. DRAFT — not legal text. The owner or counsel replaces the
 * wording and the list here before the release that shows the step to customers; no code changes
 * are needed. Bump CONSENT_TEXT_VERSION with every change: the version is stored with each
 * company's choice (audited on the server), so an admin can be asked again after a change.
 *
 * The list is drafted from seed/models/default.yaml (which vendor runs which stage) and
 * seed/models/providers.yaml (vendor names). Regions are placeholders to confirm.
 */

export const CONSENT_TEXT_VERSION = "draft-1";
/** While true, the step and every sentence carry the visible "DRAFT — not legal text" marker. */
export const CONSENT_IS_DRAFT = true;

type Both = { en: string; ar: string };

export type Subprocessor = {
  /** The vendor id the server stores in `vendor_allow_list`. */
  id: string;
  name: string;
  /** What it does with the call. */
  purpose: Both;
  region: Both;
  /** A backup vendor: used only when the main one fails (R2). "Primary vendors only" drops it. */
  backup: boolean;
};

export const SUBPROCESSORS: readonly Subprocessor[] = [
  {
    id: "assemblyai",
    name: "AssemblyAI",
    purpose: {
      en: "Turns the customer's voice into text during the call",
      ar: "يحوّل صوت العميل إلى نص أثناء المكالمة",
    },
    region: { en: "United States (to confirm)", ar: "الولايات المتحدة (للتأكيد)" },
    backup: false,
  },
  {
    id: "groq",
    name: "Groq",
    purpose: {
      en: "Writes the suggestion cards and the after-call summary",
      ar: "يكتب بطاقات الاقتراح وملخص ما بعد المكالمة",
    },
    region: { en: "United States (to confirm)", ar: "الولايات المتحدة (للتأكيد)" },
    backup: false,
  },
  {
    id: "speechmatics",
    name: "Speechmatics",
    purpose: {
      en: "Backup speech-to-text, only when the main one is down",
      ar: "تحويل احتياطي للصوت إلى نص، فقط عند تعطل الخدمة الأساسية",
    },
    region: {
      en: "United Kingdom / EU (to confirm)",
      ar: "المملكة المتحدة / الاتحاد الأوروبي (للتأكيد)",
    },
    backup: true,
  },
  {
    id: "gemini",
    name: "Google Gemini",
    purpose: {
      en: "Backup suggestion cards, only when the main one is slow or down",
      ar: "بطاقات اقتراح احتياطية، فقط عند بطء الخدمة الأساسية أو تعطلها",
    },
    region: { en: "United States (to confirm)", ar: "الولايات المتحدة (للتأكيد)" },
    backup: true,
  },
];

export const PRIMARY_VENDORS: readonly string[] = SUBPROCESSORS.filter((v) => !v.backup).map(
  (v) => v.id,
);

export const CONSENT_TEXT = {
  draftMarker: { en: "DRAFT — not legal text", ar: "مسودة — ليست نصًا قانونيًا" },
  title: { en: "Who processes your calls", ar: "من يعالج مكالماتك" },
  intro: {
    en: "During a call, the customer's audio and its text are sent to the vendors below to make suggestion cards. AGN Sales Shield chooses and checks these vendors. Call words are not stored on AGN's servers.",
    ar: "أثناء المكالمة، يُرسل صوت العميل ونصه إلى الجهات أدناه لإعداد بطاقات الاقتراح. تختار AGN Sales Shield هذه الجهات وتراجعها. لا تُحفظ كلمات المكالمة على خوادم AGN.",
  },
  primaryOnly: { en: "Primary vendors only", ar: "الجهات الأساسية فقط" },
  primaryOnlyHint: {
    en: "Backup vendors are never used. If a main vendor is down, cards may be slower or show the holding line.",
    ar: "لن تُستخدم الجهات الاحتياطية أبدًا. إذا تعطلت جهة أساسية فقد تتأخر البطاقات أو تظهر عبارة الانتظار.",
  },
  agree: {
    en: "I agree, for my company, that these vendors may process our calls.",
    ar: "أوافق، نيابة عن شركتي، على أن تعالج هذه الجهات مكالماتنا.",
  },
} as const satisfies Record<string, Both>;

export type ConsentKey = keyof typeof CONSENT_TEXT;

export function consentText(key: ConsentKey, locale: string): string {
  const both = CONSENT_TEXT[key];
  return locale === "ar" ? both.ar : both.en;
}
