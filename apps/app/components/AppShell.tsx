/**
 * Navigation shell (DESIGN.md §6, D-023): a sidebar from the wide breakpoint up; below it a top
 * bar whose menu button opens the same navigation as a drawer from the start edge (left in
 * English, right in Arabic). Items are real links (anchors on web) with the current page marked
 * for assistive tech.
 */

import {
  Icon,
  type IconName,
  LRI,
  layout,
  minTouchTarget,
  motion,
  PDI,
  radius,
  scrimOpacity,
  space,
  Text,
  useDirection,
  useGlassStyle,
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
import { ConsentStep } from "../features/admin/ConsentStep";
import { useOpenCount } from "../features/escalations/store";
import { useFollowupNotices } from "../features/followup";
import { cloudOrigin } from "../lib/cloud";
import type { StringKey } from "../lib/i18n";
import { useI18n } from "../lib/locale";
import { paletteKeys } from "../lib/platform";
import { useIsWide } from "../lib/responsive";
import { canOpen, personaFor, ROLE_AREAS, useRole } from "../lib/role";
import { useCloud } from "../lib/useCloud";
import { AppLink } from "./AppLink";
import { CommandPalette, openPalette } from "./CommandPalette";
import { useHealthBanner } from "./HealthBanner";
import { useOfflineBanner } from "./OfflineBanner";
import { usePlanBanner } from "./PlanBanner";
import { ProfilePopup } from "./ProfilePopup";
import { NoAccess } from "./RoleGate";
import { RoleSwitch } from "./RoleSwitch";
import { Tutorial } from "./Tutorial";

type NavItem = {
  href:
    | "/home"
    | "/call"
    | "/history"
    | "/reports"
    | "/coaching"
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
  { href: "/coaching", label: "nav.coaching", icon: "spark" },
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

/**
 * One banner at most (ZC-14c): "calls paused" first (it is why a call fails), then the config
 * health line with its fix, then the plan/trial line.
 */
export function ShellBanner() {
  const { role } = useRole();
  const { color } = useTheme();
  const plan = usePlanBanner();
  const health = useHealthBanner(role);
  const offline = useOfflineBanner();
  const node = offline ?? (plan?.kind === "paused" ? plan.node : (health ?? plan?.node ?? null));
  if (!node) return null;
  // UI-001: an opaque strip with one hairline, so a scrolled page is cut at the line and never
  // runs into the pill's edge.
  return (
    <View
      testID="shell-banner"
      style={[
        styles.bannerStrip,
        { backgroundColor: color.background, borderBottomColor: color.border },
      ]}
    >
      {node}
    </View>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  // INT-08 (T-081 hub line): desktop notices for due follow-ups on every page, once per app.
  useFollowupNotices();
  const wide = useIsWide();
  const { color } = useTheme();
  const { role } = useRole();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const allowed = canOpen(role, pathname);
  return (
    <View
      style={[
        styles.root,
        { flexDirection: wide ? "row" : "column", backgroundColor: color.background },
      ]}
    >
      {wide ? <Sidebar /> : <TopBar open={menuOpen} onOpen={() => setMenuOpen(true)} />}
      <View style={styles.main}>
        <ShellBanner />
        {/* R3, draft D-050 (backlog): a page outside this role's areas says why, whatever the URL. The page
            stays mounted (hidden) so the router's navigator keeps its state. */}
        <View style={allowed ? styles.main : styles.hidden}>{children}</View>
        {allowed ? null : <NoAccess />}
      </View>
      {wide ? null : <NavDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />}
      <Tutorial />
      <ConsentStep />
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
      <SearchButton
        onPress={() => {
          onClose?.();
          openPalette();
        }}
      />
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
                // Quiet Paper Glass (D-041): the current page is a gray fill, never a colour.
                active ? { backgroundColor: color.surfaceSunken } : null,
              ])}
            >
              <View style={styles.navIcon}>
                <Icon name={item.icon} size={18} color={color.text} />
              </View>
              <Text
                variant="body"
                weight={active ? "medium" : "regular"}
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
        style={({ pressed }) => [
          styles.user,
          pressed ? { backgroundColor: color.surfaceSunken } : null,
        ]}
      >
        <View style={[styles.avatar, { backgroundColor: color.bubble }]}>
          <Text variant="label" weight="semibold">
            {persona.name.slice(0, 1)}
          </Text>
        </View>
        <View style={styles.userText}>
          <Text variant="secondary" weight="medium" numberOfLines={1}>
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

/** UX-001: ⌘K had no visible way in; this opens the quick search and names its keys. */
export function SearchButton({ onPress }: { onPress: () => void }) {
  const { color } = useTheme();
  const { t } = useI18n();
  // Native phones have no ⌘K; the button alone opens the search there.
  const keys = Platform.OS === "web" ? paletteKeys() : null;
  return (
    // No accessibilityLabel: the name comes from the visible "Search" and keycap, so it always
    // contains the shortcut the button shows (axe label-content-name-mismatch).
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID="palette-open"
      style={(state) => [
        styles.search,
        {
          borderColor: color.border,
          backgroundColor:
            state.pressed || (state as { hovered?: boolean }).hovered
              ? color.surfaceSunken
              : color.surface,
        },
      ]}
    >
      <Icon name="search" size={16} color={color.textMuted} />
      <Text variant="secondary" tone="muted" style={styles.grow} numberOfLines={1}>
        {t("palette.open")}
      </Text>
      {keys ? (
        <View style={[styles.keycap, { borderColor: color.border }]}>
          <Text variant="label" tone="muted">{`${LRI}${keys}${PDI}`}</Text>
        </View>
      ) : null}
    </Pressable>
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
  // Phone top bar: floating glass chrome (D-041) over the canvas, no hairline.
  const glass = useGlassStyle();
  return (
    <View
      style={[
        styles.topBar,
        glass,
        {
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
            style={[styles.menuDot, { backgroundColor: color.signal, borderColor: color.surface }]}
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
              backgroundColor: color.surfaceRaised,
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
    <View style={[styles.count, { backgroundColor: color.bubble }]}>
      <View style={[styles.unreadDot, { backgroundColor: color.signal }]} />
      <Text variant="label" weight="medium">
        {n}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  navIcon: { width: 20, alignItems: "center" },
  root: { flex: 1 },
  main: { flex: 1, minWidth: 0 },
  hidden: { display: "none" },
  bannerStrip: { borderBottomWidth: 1, paddingBottom: space.md },
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
    marginBottom: space.lg,
  },
  sideNav: { gap: space.xs },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: minTouchTarget,
    paddingHorizontal: space.md,
    marginBottom: space.lg,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  keycap: {
    paddingHorizontal: space.xs + 2,
    paddingVertical: 1,
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  sideItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: minTouchTarget,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  count: {
    flexDirection: "row",
    gap: space.xs + 2,
    minWidth: 22,
    height: 24,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadDot: { width: 8, height: 8, borderRadius: radius.pill },
  switchWrap: { paddingHorizontal: space.sm, marginBottom: space.lg },
  user: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: minTouchTarget,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.lg,
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
    paddingHorizontal: space.sm,
    zIndex: 2,
  },
  iconButton: {
    width: minTouchTarget,
    height: minTouchTarget,
    borderRadius: radius.pill,
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
