/** Admin area (R3, R6), in four groups (UX-29, draft D-051 (backlog)): People, Connections, AI, Company. On the
 * desktop app keys, models and prompts live in the web admin panel only (D-038): Keys & providers
 * is not listed there and the AI group links to the web admin instead.
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
  useFocusRing,
  useTheme,
} from "@sotto/ui";
import { Slot, usePathname } from "expo-router";
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { AppLink } from "../../components/AppLink";
import { useFeature } from "../../components/FeatureGate";
import { RoleGate } from "../../components/RoleGate";
import { useLearningBadge } from "../../features/learning/badge";
import { configInWebOnly, openWebAdmin, webAdminUrl } from "../../features/webadmin/webAdmin";
import type { StringKey } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";

type Page = {
  href: string;
  label: StringKey;
  icon: IconName;
  /** Web only: on the desktop app it is configured in the web admin panel (D-038). */
  webOnly?: boolean;
  /** Older routes that belong to this page (deep links keep working, UX-29). */
  also?: readonly string[];
};
type Group = { id: string; label: StringKey; icon: IconName; pages: readonly Page[] };

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
      {
        href: "/admin/keys",
        label: "admin.keys",
        icon: "key",
        webOnly: true,
        also: ["/admin/models", "/admin/prompts"],
      },
    ],
  },
  {
    id: "ai",
    label: "admin.group.ai",
    icon: "spark",
    pages: [
      { href: "/admin/instructions", label: "learning.tab", icon: "spark" },
      { href: "/playbook", label: "admin.playbookLink", icon: "playbook" },
    ],
  },
  {
    id: "company",
    label: "admin.group.company",
    icon: "shield",
    pages: [
      { href: "/admin/settings", label: "admin.settings", icon: "settings" },
      { href: "/admin/features", label: "admin.features", icon: "shield" },
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
  const { t } = useI18n();
  const { color } = useTheme();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const webFocus = useFocusRing();
  const webOnly = configInWebOnly();
  const learning = useFeature("learned_instructions");
  const fresh = useLearningBadge(learning.state === "available");
  // A page hidden on the desktop hands its older routes to the group's first page.
  const groups = ADMIN_GROUPS.map((g) => {
    const gone = g.pages.filter((p) => webOnly && p.webOnly).flatMap((p) => p.also ?? []);
    const pages = g.pages.filter((p) => !(webOnly && p.webOnly));
    return {
      ...g,
      pages: pages.map((p, i) =>
        i === 0 && gone.length ? { ...p, also: [...(p.also ?? []), ...gone] } : p,
      ),
    };
  });
  const current = groups.find((g) => g.pages.some((p) => pageActive(pathname, p))) ?? groups[0];
  const subpages = current?.pages ?? [];
  const webLink = webOnly && webAdminUrl() && current?.id === "ai";
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
        {subpages.length > 1 || webLink ? (
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
                    {t(p.label)}
                  </Text>
                </AppLink>
              );
            })}
            {webLink ? (
              <Pressable
                testID="admin-web-models"
                accessibilityRole="link"
                accessibilityLabel={t("admin.webPanel.link")}
                onPress={openWebAdmin}
                onFocus={webFocus.onFocus}
                onBlur={webFocus.onBlur}
                style={[styles.subTab, webFocus.ring]}
              >
                <Text variant="label" tone="muted">
                  {t("admin.webPanel.link")}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <Slot />
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
