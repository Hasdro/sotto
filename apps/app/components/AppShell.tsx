/**
 * Navigation shell (DESIGN.md §6): a sidebar from the wide breakpoint up, bottom tabs below it.
 * Items are real links (anchors on web) with the current page marked for assistive tech.
 */
import { layout, radius, space, Text, useTheme, Wordmark } from "@sotto/ui";
import { Link, usePathname } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { countByStatus, INBOX } from "../features/inbox/mock";
import type { StringKey } from "../lib/i18n";
import { useI18n } from "../lib/locale";
import { useIsWide } from "../lib/responsive";

type NavItem = { href: "/call" | "/history" | "/playbook" | "/inbox" | "/admin"; label: StringKey };

export const NAV: readonly NavItem[] = [
  { href: "/call", label: "nav.call" },
  { href: "/history", label: "nav.history" },
  { href: "/playbook", label: "nav.playbook" },
  { href: "/inbox", label: "nav.inbox" },
  { href: "/admin", label: "nav.admin" },
];

export function isActive(pathname: string, href: string): boolean {
  if (href === "/call") return pathname === "/" || pathname.startsWith("/call");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const wide = useIsWide();
  const { color } = useTheme();
  return (
    <View
      style={[
        styles.root,
        { flexDirection: wide ? "row" : "column", backgroundColor: color.background },
      ]}
    >
      {wide ? <Sidebar /> : null}
      <View style={styles.main}>{children}</View>
      {wide ? null : <BottomTabs />}
    </View>
  );
}

const openCount = countByStatus(INBOX).open;

function Sidebar() {
  const { color } = useTheme();
  const { t } = useI18n();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.sidebar,
        {
          backgroundColor: color.surface,
          borderEndColor: color.border,
          paddingTop: insets.top + space.xl,
        },
      ]}
    >
      <View style={styles.brand}>
        <Wordmark name={t("app.name")} />
      </View>
      <View role="navigation" accessibilityLabel={t("nav.label")} style={styles.sideNav}>
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link key={item.href} href={item.href} asChild>
              <Pressable
                accessibilityRole="link"
                accessibilityState={{ selected: active }}
                aria-current={active ? "page" : undefined}
                style={StyleSheet.flatten([
                  styles.sideItem,
                  active ? { backgroundColor: color.surfaceSunken } : null,
                ])}
              >
                <View
                  style={[
                    styles.sideBar,
                    { backgroundColor: active ? color.primary : "transparent" },
                  ]}
                />
                <Text
                  variant="body"
                  weight={active ? "semibold" : "regular"}
                  tone={active ? "primary" : "default"}
                  style={styles.grow}
                >
                  {t(item.label)}
                </Text>
                {item.href === "/inbox" && openCount > 0 ? <Count n={openCount} /> : null}
              </Pressable>
            </Link>
          );
        })}
      </View>
      <View style={styles.grow} />
      <View style={[styles.user, { borderTopColor: color.border }]}>
        <View style={[styles.avatar, { backgroundColor: color.surfaceSunken }]}>
          <Text variant="label" weight="semibold">
            {t("nav.user").slice(0, 1)}
          </Text>
        </View>
        <View>
          <Text variant="label" weight="semibold">
            {t("nav.user")}
          </Text>
          <Text variant="label" tone="muted">
            {t("nav.role")}
          </Text>
        </View>
      </View>
    </View>
  );
}

function Count({ n }: { n: number }) {
  const { color } = useTheme();
  return (
    <View style={[styles.count, { backgroundColor: color.primary }]}>
      <Text variant="label" weight="semibold" tone="onPrimary">
        {n}
      </Text>
    </View>
  );
}

function BottomTabs() {
  const { color } = useTheme();
  const { t } = useI18n();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  return (
    <View
      role="navigation"
      accessibilityLabel={t("nav.label")}
      style={[
        styles.tabs,
        {
          backgroundColor: color.surface,
          borderTopColor: color.border,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link key={item.href} href={item.href} asChild>
            <Pressable
              accessibilityRole="link"
              accessibilityState={{ selected: active }}
              aria-current={active ? "page" : undefined}
              style={styles.tab}
            >
              <View
                style={[styles.tabBar, { backgroundColor: active ? color.primary : "transparent" }]}
              />
              <View style={styles.tabLabel}>
                <Text
                  variant="label"
                  weight={active ? "semibold" : "medium"}
                  tone={active ? "primary" : "muted"}
                  numberOfLines={1}
                >
                  {t(item.label)}
                </Text>
                {item.href === "/inbox" && openCount > 0 ? (
                  <View style={[styles.dot, { backgroundColor: color.primary }]} />
                ) : null}
              </View>
            </Pressable>
          </Link>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  main: { flex: 1, minWidth: 0 },
  grow: { flex: 1 },
  sidebar: {
    width: layout.sidebarWidth,
    borderEndWidth: 1,
    paddingHorizontal: space.md,
    paddingBottom: space.lg,
  },
  brand: { paddingHorizontal: space.md, marginBottom: space.xxl },
  sideNav: { gap: space.xs },
  sideItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 44,
    paddingEnd: space.md,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  sideBar: { width: 3, alignSelf: "stretch", borderRadius: radius.pill },
  count: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: space.xs + 2,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  user: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderTopWidth: 1,
    paddingTop: space.lg,
    paddingHorizontal: space.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  tabs: { flexDirection: "row", borderTopWidth: 1 },
  tab: { flex: 1, minHeight: 56, alignItems: "center" },
  tabBar: { height: 3, width: 28, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  tabLabel: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.xs },
  dot: { width: 6, height: 6, borderRadius: radius.pill },
});
