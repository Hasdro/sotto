/** Admin area (R3, R6), in four groups (UX-29, draft D-051 (backlog)): People, Connections, AI, Company.
 * Round 2 (D-078): model configuration left the client entirely — no Keys & providers page, no
 * Models or Prompt studio routes, no link to a web admin panel. Models are configured per
 * organisation on the vendor panel.
 * Quiet Paper Glass (D-041, DESIGN-SYSTEM.md §5.4): the 34 px page title, the groups as neutral
 * pill tabs (current = gray fill + w500, never a colour), the group's pages as smaller pills. */

import {
  Badge,
  Icon,
  type IconName,
  layout,
  minTouchTarget,
  PageHeader,
  radius,
  space,
  Text,
  useTheme,
} from "@sotto/ui";
import { Slot, usePathname } from "expo-router";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { AdminTour } from "../../components/AdminTour";
import { AppLink } from "../../components/AppLink";
import { useFeature } from "../../components/FeatureGate";
import { RoleGate } from "../../components/RoleGate";
import { useLearningBadge } from "../../features/learning/badge";
import type { Locale, StringKey } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";

/** A page label added in a wave whose i18n.ts belongs to another stream (D-058): both texts. */
type OwnLabel = Record<Locale, string>;
type Page = {
  href: string;
  label: StringKey | OwnLabel;
  icon: IconName;
  /** Older routes that belong to this page (deep links keep working, UX-29). */
  also?: readonly string[];
};
type Group = { id: string; label: StringKey; icon: IconName; pages: readonly Page[] };

const ATTACHMENTS_LABEL: OwnLabel = { en: "Attachments", ar: "المرفقات" };
const SETUP_LABEL: OwnLabel = { en: "Setup guide", ar: "دليل الإعداد" };

/** UX-29, draft D-051 (backlog): four groups instead of nine tabs in a scrolling row. */
export const ADMIN_GROUPS: readonly Group[] = [
  {
    id: "people",
    label: "admin.group.people",
    icon: "users",
    pages: [{ href: "/admin", label: "admin.team", icon: "users" }],
  },
  {
    id: "connections",
    label: "admin.group.connections",
    icon: "globe",
    pages: [
      { href: "/admin/integrations", label: "admin.integrations", icon: "globe" },
      // INT-14b: the files agents may attach to follow-up emails.
      { href: "/admin/attachments", label: ATTACHMENTS_LABEL, icon: "mail" },
    ],
  },
  {
    id: "ai",
    label: "admin.group.ai",
    icon: "spark",
    pages: [
      { href: "/admin/instructions", label: "learning.tab", icon: "spark" },
      { href: "/admin/memory", label: { en: "Style memory", ar: "ذاكرة الأسلوب" }, icon: "spark" },
      { href: "/playbook", label: "admin.playbookLink", icon: "playbook" },
    ],
  },
  {
    id: "company",
    label: "admin.group.company",
    icon: "shield",
    pages: [
      { href: "/admin/setup", label: SETUP_LABEL, icon: "spark" },
      { href: "/admin/settings", label: "admin.settings", icon: "settings" },
      { href: "/admin/features", label: "admin.features", icon: "shield" },
      // Round 3: the plan, what was paid and the upgrade (billing), and the bug-report
      // review queue (reports) live in the Company group.
      { href: "/admin/billing", label: "admin.billing", icon: "cards" },
      { href: "/admin/reports", label: "bug.queue.title", icon: "message" },
      {
        href: "/admin/company",
        label: "admin.company",
        icon: "list",
        also: ["/admin/recordings", "/admin/devices", "/admin/activity"],
      },
    ],
  },
];

const under = (pathname: string, href: string) =>
  href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

function pageActive(pathname: string, page: Page): boolean {
  return under(pathname, page.href) || (page.also ?? []).some((h) => under(pathname, h));
}

export default function AdminRoute() {
  return (
    <RoleGate area="/admin">
      <AdminLayout />
    </RoleGate>
  );
}

function AdminLayout() {
  const { t, locale } = useI18n();
  const { color } = useTheme();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const learning = useFeature("learned_instructions");
  const fresh = useLearningBadge(learning.state === "available");
  const groups = ADMIN_GROUPS;
  const current = groups.find((g) => g.pages.some((p) => pageActive(pathname, p))) ?? groups[0];
  const subpages = current?.pages ?? [];
  return (
    <ScrollView style={{ backgroundColor: color.background }} contentContainerStyle={styles.page}>
      <View style={styles.column}>
        <PageHeader title={t("admin.title")} compact={width < layout.wideBreakpoint} />
        <View role="navigation" accessibilityLabel={t("admin.groups")} style={styles.tabs}>
          {groups.map((g) => {
            const active = g.id === current?.id;
            const first = g.pages[0];
            if (!first) return null;
            return (
              <AppLink
                key={g.id}
                href={first.href}
                accessibilityRole="link"
                accessibilityState={{ selected: active }}
                aria-current={active ? "page" : undefined}
                testID={`admin-group-${g.id}`}
                style={StyleSheet.flatten([
                  styles.tab,
                  { backgroundColor: active ? color.surfaceSunken : "transparent" },
                ])}
              >
                <View style={styles.tabInner}>
                  <Icon name={g.icon} size={18} color={color.text} />
                  <Text variant="body" weight={active ? "medium" : "regular"}>
                    {t(g.label)}
                  </Text>
                  {g.id === "ai" && fresh > 0 ? (
                    <Badge
                      testID="instructions-tab-badge"
                      label={t("learning.badge", { count: fresh })}
                      tone="primary"
                    />
                  ) : null}
                </View>
              </AppLink>
            );
          })}
        </View>
        {subpages.length > 1 ? (
          <View
            role="navigation"
            accessibilityLabel={t("admin.pages")}
            style={[styles.subTabs, { borderTopColor: color.border }]}
            testID="admin-pages"
          >
            {subpages.map((p) => {
              const active = pageActive(pathname, p);
              return (
                <AppLink
                  key={p.href}
                  href={p.href}
                  accessibilityRole="link"
                  accessibilityState={{ selected: active }}
                  aria-current={active ? "page" : undefined}
                  testID={`admin-page-${p.href.split("/").pop()}`}
                  style={StyleSheet.flatten([
                    styles.subTab,
                    {
                      backgroundColor: active ? color.bubble : "transparent",
                    },
                  ])}
                >
                  <Text variant="label" weight={active ? "medium" : "regular"}>
                    {typeof p.label === "string" ? t(p.label) : p.label[locale]}
                  </Text>
                </AppLink>
              );
            })}
          </View>
        ) : null}
        <Slot />
        <AdminTour />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: space.xl, paddingVertical: space.xxxl, flexGrow: 1 },
  column: {
    width: "100%",
    maxWidth: layout.contentMaxWidth,
    alignSelf: "center",
    gap: space.lg,
  },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  tab: {
    minHeight: minTouchTarget,
    justifyContent: "center",
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
  },
  tabInner: { flexDirection: "row", alignItems: "center", gap: space.sm },
  subTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
    paddingTop: space.md,
    marginBottom: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  subTab: {
    minHeight: minTouchTarget,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
  },
});
