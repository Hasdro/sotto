/**
 * Navigation shell (DESIGN.md §6): a sidebar from the wide breakpoint up, bottom tabs below it.
 * Items are real links (anchors on web) with the current page marked for assistive tech.
 */
import { layout, radius, space, Text, useTheme, Wordmark } from "@sotto/ui";
import { Link, usePathname } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEscalations } from "../features/escalations/store";
import { countByStatus } from "../features/inbox/mock";
import { cloudOrigin } from "../lib/cloud";
import type { StringKey } from "../lib/i18n";
import { useI18n } from "../lib/locale";
import { useIsWide } from "../lib/responsive";
import { personaFor, ROLE_AREAS, useRole } from "../lib/role";
import { useCloud } from "../lib/useCloud";
import { PlanBanner } from "./PlanBanner";
import { RoleSwitch } from "./RoleSwitch";

type NavItem = {
  href: "/call" | "/history" | "/playbook" | "/inbox" | "/admin" | "/account";
  label: StringKey;
};

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

const ACCOUNT: NavItem = { href: "/account", label: "nav.account" };

/** The nav items the current role may open (R3); Account when signed in to a server (D-022). */
function useNav(): readonly NavItem[] {
  const { role } = useRole();
  const items = NAV.filter(
    (item) => item.href !== "/account" && ROLE_AREAS[role].includes(item.href),
  );
  return cloudOrigin() ? [...items, ACCOUNT] : items;
}

export function AppShell({ children }: { children: ReactNode }) {
  const wide = useIsWide();
  const { color } = useTheme();
  const pathname = usePathname();
  // Narrow screens have no sidebar; the switch sits above every page except the call itself.
  const roleBar = !wide && !isActive(pathname, "/call");
  return (
    <View
      style={[
        styles.root,
        { flexDirection: wide ? "row" : "column", backgroundColor: color.background },
      ]}
    >
      {wide ? <Sidebar /> : null}
      <View style={styles.main}>
        {roleBar ? (
          <View
            style={[
              styles.roleBar,
              { backgroundColor: color.surface, borderBottomColor: color.border },
            ]}
          >
            <RoleSwitch />
          </View>
        ) : null}
        <PlanBanner />
        {children}
      </View>
      {wide ? null : <BottomTabs />}
    </View>
  );
}

function useOpenCount(): number {
  return countByStatus(useEscalations().inbox).open;
}

function Sidebar() {
  const { color } = useTheme();
  const { t } = useI18n();
  const { role } = useRole();
  const pathname = usePathname();
  const nav = useNav();
  const openCount = useOpenCount();
  const cloud = useCloud();
  const persona = cloud.status === "signed_in" ? { name: cloud.me.user.name } : personaFor(role);
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
        {nav.map((item) => {
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
      {cloudOrigin() ? null : (
        <View style={styles.switchWrap}>
          <RoleSwitch />
        </View>
      )}
      <View style={[styles.user, { borderTopColor: color.border }]}>
        <View style={[styles.avatar, { backgroundColor: color.surfaceSunken }]}>
          <Text variant="label" weight="semibold">
            {persona.name.slice(0, 1)}
          </Text>
        </View>
        <View>
          <Text variant="label" weight="semibold">
            {persona.name}
          </Text>
          <Text variant="label" tone="muted">
            {t(`role.${role}`)}
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
  const nav = useNav();
  const openCount = useOpenCount();
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
      {nav.map((item) => {
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
  switchWrap: { paddingHorizontal: space.sm, marginBottom: space.lg },
  roleBar: { borderBottomWidth: 1, paddingHorizontal: space.lg, paddingVertical: space.sm },
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
