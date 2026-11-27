/**
 * The Admin pages in their four groups (UX-29, draft D-051 (backlog)): People, Connections, AI,
 * Company. The admin layout draws its tabs from this list and the ⌘K search indexes it (UX-001),
 * so a page added here is reachable both ways.
 */
import type { IconName } from "@sotto/ui";
import type { Locale, StringKey } from "../../lib/i18n";

/** A page label added in a wave whose i18n.ts belongs to another stream (D-058): both texts. */
export type OwnLabel = Record<Locale, string>;
export type AdminPage = {
  href: string;
  label: StringKey | OwnLabel;
  icon: IconName;
  /** Older routes that belong to this page (deep links keep working, UX-29). */
  also?: readonly string[];
  /** Other words people search for this page with, in both languages (UX-001). Never shown. */
  terms?: string;
};
export type AdminGroup = {
  id: string;
  label: StringKey;
  icon: IconName;
  pages: readonly AdminPage[];
};

const ATTACHMENTS_LABEL: OwnLabel = { en: "Attachments", ar: "المرفقات" };
const SETUP_LABEL: OwnLabel = { en: "Setup guide", ar: "دليل الإعداد" };
const TONE_LABEL: OwnLabel = { en: "Card tone", ar: "نبرة البطاقات" };

/** UX-29, draft D-051 (backlog): four groups instead of nine tabs in a scrolling row. */
export const ADMIN_GROUPS: readonly AdminGroup[] = [
  {
    id: "people",
    label: "admin.group.people",
    icon: "users",
    pages: [
      {
        href: "/admin",
        label: "admin.team",
        icon: "users",
        terms: "people users members invite roles seats الأشخاص المستخدمون دعوة الأدوار المقاعد",
      },
    ],
  },
  {
    id: "connections",
    label: "admin.group.connections",
    icon: "globe",
    pages: [
      {
        href: "/admin/integrations",
        label: "admin.integrations",
        icon: "globe",
        terms: "zoho crm email smtp whatsapp connect زوهو البريد واتساب ربط",
      },
      // INT-14b: the files agents may attach to follow-up emails.
      {
        href: "/admin/attachments",
        label: ATTACHMENTS_LABEL,
        icon: "mail",
        terms: "files documents pdf email الملفات المستندات",
      },
    ],
  },
  {
    id: "ai",
    label: "admin.group.ai",
    icon: "spark",
    pages: [
      {
        href: "/admin/instructions",
        label: "learning.tab",
        icon: "spark",
        terms: "learned instructions ratings learning التعليمات التقييمات",
      },
      {
        href: "/admin/memory",
        label: { en: "Style memory", ar: "ذاكرة الأسلوب" },
        icon: "spark",
        terms: "style writing emails الأسلوب",
      },
      {
        href: "/admin/tone",
        label: TONE_LABEL,
        icon: "message",
        terms: "tone wording cards النبرة البطاقات",
      },
      { href: "/playbook", label: "admin.playbookLink", icon: "playbook" },
      {
        href: "/admin/coach",
        label: { en: "Coach", ar: "المدرب" },
        icon: "spark",
        terms: "voice coach review transcripts المدرب الصوتي المراجعة",
      },
    ],
  },
  {
    id: "company",
    label: "admin.group.company",
    icon: "shield",
    pages: [
      {
        href: "/admin/setup",
        label: SETUP_LABEL,
        icon: "spark",
        terms: "setup onboarding checklist start الإعداد البدء",
      },
      {
        href: "/admin/settings",
        label: "admin.settings",
        icon: "settings",
        terms: "company defaults recording language الافتراضية التسجيل اللغة",
      },
      {
        href: "/admin/features",
        label: "admin.features",
        icon: "shield",
        terms: "features flags modules switches الميزات",
      },
      // Round 3: the plan, what was paid and the upgrade (billing), and the bug-report
      // review queue (reports) live in the Company group.
      {
        href: "/admin/billing",
        label: "admin.billing",
        icon: "cards",
        terms:
          "billing plan trial upgrade subscription seats minutes invoice الخطة الاشتراك التجربة الترقية",
      },
      {
        href: "/admin/reports",
        label: "bug.queue.title",
        icon: "message",
        terms: "bugs feedback problems المشكلات الأخطاء",
      },
      {
        href: "/admin/company",
        label: "admin.company",
        icon: "list",
        also: ["/admin/recordings", "/admin/devices", "/admin/activity"],
        terms: "activity devices recordings audit log sessions الأجهزة التسجيلات النشاط السجل",
      },
    ],
  },
];

/** A page's label in the current language. */
export function adminPageLabel(
  page: AdminPage,
  t: (key: StringKey) => string,
  locale: Locale,
): string {
  return typeof page.label === "string" ? t(page.label) : page.label[locale];
}
