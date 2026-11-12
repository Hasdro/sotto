/**
 * Navigation shell (DESIGN.md §6, D-023): a sidebar from the wide breakpoint up; below it a top
 * bar whose menu button opens the same navigation as a drawer from the start edge (left in
 * English, right in Arabic). Items are real links (anchors on web) with the current page marked
 * for assistive tech.
 */

import {
  Icon,
  type IconName,
  layout,
  minTouchTarget,
  motion,
  radius,
  scrimOpacity,
  space,
  Text,
  useDirection,
  useTheme,
  Wordmark,
} from "@sotto/ui";
import { usePathname } from "expo-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOpenCount } from "../features/escalations/store";
import { cloudOrigin } from "../lib/cloud";
import type { StringKey } from "../lib/i18n";
import { useI18n } from "../lib/locale";
import { useIsWide } from "../lib/responsive";
import { personaFor, ROLE_AREAS, useRole } from "../lib/role";
import { useCloud } from "../lib/useCloud";
import { AppLink } from "./AppLink";
import { CommandPalette } from "./CommandPalette";
import { PlanBanner } from "./PlanBanner";
import { ProfilePopup } from "./ProfilePopup";
import { RoleSwitch } from "./RoleSwitch";
import { Tutorial } from "./Tutorial";

type NavItem = {
  href:
    | "/home"
    | "/call"
    | "/history"
    | "/reports"
    | "/playbook"
    | "/inbox"
    | "/admin"
    | "/settings"
    | "/account";
  label: StringKey;
  /** Sotto's own icon beside every section name (owner, 22 Oct). */
  icon: IconName;
};

export const NAV: readonly NavItem[] = [
  { href: "/home", label: "nav.home", icon: "home" },
  { href: "/call", label: "nav.call", icon: "call" },
  { href: "/history", label: "nav.history", icon: "history" },
  { href: "/reports", label: "nav.reports", icon: "reports" },
  { href: "/playbook", label: "nav.playbook", icon: "playbook" },
  { href: "/inbox", label: "nav.inbox", icon: "inbox" },
  { href: "/admin", label: "nav.admin", icon: "admin" },
  { href: "/settings", label: "nav.settings", icon: "settings" },
];

export function isActive(pathname: string, href: string): boolean {
  if (href === "/home") return pathname === "/" || pathname.startsWith("/home");
  return pathname === href || pathname.startsWith(`${href}/`);
}

const ACCOUNT: NavItem = { href: "/account", label: "nav.account", icon: "account" };

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
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <View
      style={[
        styles.root,
        { flexDirection: wide ? "row" : "column", backgroundColor: color.background },
      ]}
    >
      {wide ? <Sidebar /> : <TopBar open={menuOpen} onOpen={() => setMenuOpen(true)} />}
      <View style={styles.main}>
        <PlanBanner />
        {children}
      </View>
      {wide ? null : <NavDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />}
      <Tutorial />
      <Palette />
    </View>
  );
}

/** ⌘K quick search over the sections this person may open (owner, 22 Oct). */
function Palette() {
  const nav = useNav();
  return <CommandPalette sections={nav} />;
}

/** Brand, links, role switch and the user footer: the sidebar and the drawer show the same. */
function NavPanel({ onClose }: { onClose?: () => void }) {
  const { color } = useTheme();
  const { t } = useI18n();
  const { role } = useRole();
  const pathname = usePathname();
  const nav = useNav();
  const openCount = useOpenCount();
  const cloud = useCloud();
  const signedIn = cloud.status === "signed_in";
  const persona = signedIn ? { name: cloud.me.user.name } : personaFor(role);
  const roleLine =
    signedIn && cloud.me.company
      ? `${t(`role.${role}`)} · ${cloud.me.company.name}`
      : t(`role.${role}`);
  const [profile, setProfile] = useState(false);
  return (
    <>
      <View style={styles.brand}>
        <Wordmark name={t("app.name")} />
        {onClose ? <CloseButton label={t("nav.close")} onPress={onClose} /> : null}
      </View>
      <View role="navigation" accessibilityLabel={t("nav.label")} style={styles.sideNav}>
        {nav.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <AppLink
              key={item.href}
              href={item.href}
              onNavigate={onClose}
              accessibilityRole="link"
              accessibilityState={{ selected: active }}
              aria-current={active ? "page" : undefined}
              testID={`nav-${item.href.slice(1)}`}
              accessibilityLabel={
                item.href === "/inbox" && openCount > 0
                  ? `${t(item.label)} ${openCount}`
                  : t(item.label)
              }
              // Link asChild needs a plain style object (a style function is dropped on web).
              style={StyleSheet.flatten([
                styles.sideItem,
                active ? { backgroundColor: color.surface } : null,
              ])}
            >
              <View
                style={[
                  styles.sideBar,
                  // The active page carries the one warm signal accent (T-050).
                  { backgroundColor: active ? color.signal : "transparent" },
                ]}
              />
              <View style={styles.navIcon}>
                <Icon name={item.icon} size={20} color={active ? color.primary : color.textMuted} />
              </View>
              <Text
                variant="body"
                weight={active ? "semibold" : "regular"}
                tone={active ? "primary" : "muted"}
                style={styles.grow}
                numberOfLines={1}
              >
                {item.href === "/inbox" && openCount > 0 ? `${t(item.label)} ` : t(item.label)}
              </Text>
              {item.href === "/inbox" && openCount > 0 ? <Count n={openCount} /> : null}
            </AppLink>
          );
        })}
      </View>
      <View style={styles.grow} />
      {cloudOrigin() ? null : (
        <View style={styles.switchWrap}>
          <RoleSwitch />
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        // The button's name is the person's own visible name (WCAG label in name); the hint
        // says what pressing it does.
        accessibilityHint={t("profile.open")}
        disabled={!signedIn}
        onPress={() => setProfile(true)}
        testID="profile-open"
        style={[styles.user, { borderTopColor: color.border }]}
      >
        <View style={[styles.avatar, { backgroundColor: color.surfaceSunken }]}>
          <Text variant="label" weight="semibold">
            {persona.name.slice(0, 1)}
          </Text>
        </View>
        <View style={styles.userText}>
          <Text variant="label" weight="semibold" numberOfLines={1}>
            {persona.name}
          </Text>
          <Text variant="label" tone="muted" numberOfLines={1}>
            {roleLine}
          </Text>
        </View>
      </Pressable>
      <ProfilePopup open={profile} onClose={() => setProfile(false)} />
    </>
  );
}

function Sidebar() {
  const { color } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.sidebar,
        {
          // The sidebar recedes into the page (T-050): same grey-blue, one hairline.
          backgroundColor: color.background,
          borderEndColor: color.border,
          paddingTop: insets.top + space.xl,
        },
      ]}
    >
      <NavPanel />
    </View>
  );
}

/** Narrow screens: the menu button (start side) and the wordmark. */
function TopBar({ open, onOpen }: { open: boolean; onOpen: () => void }) {
  const { color } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const openCount = useOpenCount();
  const dot = openCount > 0 && nav.some((item) => item.href === "/inbox");
  return (
    <View
      style={[
        styles.topBar,
        {
          backgroundColor: color.surface,
          borderBottomColor: color.border,
          paddingTop: insets.top,
          height: layout.topBarHeight + insets.top,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={dot ? t("nav.openWithCount", { count: openCount }) : t("nav.open")}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        aria-haspopup="dialog"
        onPress={onOpen}
        testID="menu-button"
        hitSlop={4}
        style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}
      >
        <View style={styles.burger}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.burgerLine, { backgroundColor: color.text }]} />
          ))}
        </View>
        {dot ? (
          <View
            testID="menu-dot"
            style={[styles.menuDot, { backgroundColor: color.primary, borderColor: color.surface }]}
          />
        ) : null}
      </Pressable>
      <Wordmark name={t("app.name")} />
    </View>
  );
}

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => {
        if (live) setReduce(on);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      live = false;
      sub?.remove();
    };
  }, []);
  return reduce;
}

/**
 * The phone drawer (D-023). `Modal` gives Android back and Escape (onRequestClose) and, on web,
 * a focus trap. The panel sits on the physical start edge, so it is set from the direction.
 */
function NavDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { color } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.min(layout.drawerMaxWidth, Math.round(windowWidth * 0.85));
  const [mounted, setMounted] = useState(open);
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    if (open) setMounted(true);
    const done = () => {
      if (!open) setMounted(false);
    };
    if (reduceMotion) {
      progress.setValue(open ? 1 : 0);
      done();
      return;
    }
    const anim = Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: open ? motion.base : motion.fast,
      useNativeDriver: Platform.OS !== "web",
    });
    anim.start(({ finished }) => {
      if (finished) done();
    });
    return () => anim.stop();
  }, [open, reduceMotion, progress]);

  if (!mounted) return null;
  const from = dir === "rtl" ? width : -width;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View
        {...(Platform.OS === "web" ? { dir } : {})}
        style={[styles.drawerRoot, { direction: dir }]}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: color.scrim,
              opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, scrimOpacity] }),
            },
          ]}
        >
          <Pressable
            testID="nav-scrim"
            accessibilityRole="button"
            accessibilityLabel={t("nav.close")}
            onPress={onClose}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <Animated.View
          testID="nav-drawer"
          // Modal is the dialog (role and focus trap on web); this keeps VoiceOver inside it.
          accessibilityViewIsModal
          style={[
            styles.drawer,
            dir === "rtl" ? { right: 0, borderLeftWidth: 1 } : { left: 0, borderRightWidth: 1 },
            {
              width,
              backgroundColor: color.surface,
              borderColor: color.border,
              paddingTop: insets.top + space.lg,
              paddingBottom: insets.bottom + space.lg,
              transform: [
                {
                  translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }),
                },
              ],
            },
          ]}
        >
          <NavPanel onClose={onClose} />
        </Animated.View>
      </View>
    </Modal>
  );
}

function CloseButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { color } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID="menu-close"
      style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}
    >
      <View style={styles.cross}>
        <View
          style={[
            styles.crossLine,
            { backgroundColor: color.text, transform: [{ rotate: "45deg" }] },
          ]}
        />
        <View
          style={[
            styles.crossLine,
            { backgroundColor: color.text, transform: [{ rotate: "-45deg" }] },
          ]}
        />
      </View>
    </Pressable>
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

const styles = StyleSheet.create({
  navIcon: { width: 24, alignItems: "center" },
  root: { flex: 1 },
  main: { flex: 1, minWidth: 0 },
  grow: { flex: 1 },
  pressed: { opacity: 0.8 },
  sidebar: {
    width: layout.sidebarWidth,
    borderEndWidth: 1,
    paddingHorizontal: space.md,
    paddingBottom: space.lg,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: minTouchTarget,
    paddingHorizontal: space.md,
    marginBottom: space.xl,
  },
  sideNav: { gap: space.xs },
  sideItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: minTouchTarget,
    paddingEnd: space.md,
    borderRadius: radius.sm,
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
  user: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderTopWidth: 1,
    paddingTop: space.lg,
    paddingHorizontal: space.sm,
  },
  userText: { flexShrink: 1, minWidth: 0 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderBottomWidth: 1,
    paddingHorizontal: space.sm,
  },
  iconButton: {
    width: minTouchTarget,
    height: minTouchTarget,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  burger: { width: 20, gap: 4 },
  burgerLine: { height: 2, borderRadius: 1 },
  menuDot: {
    position: "absolute",
    top: 8,
    end: 7,
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    borderWidth: 2,
  },
  cross: { width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  crossLine: { position: "absolute", width: 20, height: 2, borderRadius: 1 },
  drawerRoot: { flex: 1 },
  drawer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    paddingHorizontal: space.md,
  },
});
