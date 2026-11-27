/**
 * The profile popup (owner, 21 Oct): opens from the person's name in the menu and shows who is
 * signed in, their company and plan. UI-002: instead of repeating the sidebar's Account and
 * Settings rows it shows the theme and language (one tap to change them) and the keyboard
 * shortcuts, with Sign out apart under a divider.
 */
import {
  Badge,
  Icon,
  LRI,
  minTouchTarget,
  PDI,
  radius,
  space,
  Text,
  useDirection,
  useGlassStyle,
  useTheme,
} from "@sotto/ui";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { scrollToAnchor } from "../lib/anchor";
import { signOut } from "../lib/cloud";
import { desktop } from "../lib/desktop";
import { useI18n } from "../lib/locale";
import { paletteKeys, shortcutKeys } from "../lib/platform";
import { usePrefs } from "../lib/prefs";
import { useCloud } from "../lib/useCloud";

const hovered = (state: object) => (state as { hovered?: boolean }).hovered === true;

export function ProfilePopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { color, card } = useTheme();
  const glass = useGlassStyle({ elevated: true });
  const { t, locale } = useI18n();
  const rtl = useDirection() === "rtl";
  const prefs = usePrefs();
  const router = useRouter();
  const cloud = useCloud();
  const shown = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!open) return;
    shown.setValue(0);
    Animated.timing(shown, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [open, shown]);
  if (cloud.status !== "signed_in") return null;
  const { user, company } = cloud.me;
  const appearance = () => {
    onClose();
    router.push("/settings#appearance");
    scrollToAnchor("/settings#appearance");
  };
  // ⌘K works in any browser; the call shortcuts belong to the desktop app. Phones have neither.
  const keys = shortcutKeys();
  const shortcuts: [string, string][] =
    Platform.OS !== "web"
      ? []
      : [
          [t("palette.open"), paletteKeys()],
          ...(desktop()
            ? ([
                [t("profile.key.listen"), keys.listen],
                [t("profile.key.copy"), keys.copy],
                [t("profile.key.mini"), keys.mini],
              ] as [string, string][])
            : []),
        ];
  const rows: [string, string][] = [
    [t("profile.email"), user.email],
    [t("profile.role"), t(`role.short.${user.role}`)],
    ...(company
      ? ([
          [t("profile.company"), company.name],
          [t("profile.seats"), `${company.seats_used} / ${company.seats}`],
        ] as [string, string][])
      : []),
  ];
  return (
    <Modal transparent visible={open} onRequestClose={onClose} animationType="none">
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityLabel={t("nav.close")}
        accessibilityRole="button"
      />
      <Animated.View
        testID="profile-popup"
        accessibilityViewIsModal
        style={[
          styles.sheet,
          // Next to the profile button: the sidebar is on the right in Arabic.
          rtl ? { right: space.lg } : { left: space.lg },
          glass,
          {
            opacity: shown,
            transform: [
              { translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
              { scale: shown.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
            ],
          },
        ]}
      >
        <View style={styles.head}>
          <View style={[styles.avatar, { backgroundColor: card.answer.fill }]}>
            <Text variant="heading" weight="semibold" color={card.answer.text}>
              {user.name.slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={styles.flex}>
            <Text variant="heading" weight="semibold" numberOfLines={1}>
              {user.name}
            </Text>
            {company ? (
              <Badge
                label={t(`home.plan.${company.status}`)}
                tone={company.status === "active" ? "answer" : "question"}
              />
            ) : null}
          </View>
        </View>
        {rows.map(([k, v]) => (
          <View key={k} style={[styles.row, { borderTopColor: color.border }]}>
            <Text variant="label" tone="muted">
              {k}
            </Text>
            <Text variant="label" weight="medium" numberOfLines={1} style={styles.value}>
              {v}
            </Text>
          </View>
        ))}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${t("settings.appearance")}: ${t(`settings.theme.${prefs.theme}`)} · ${t(`lang.${locale}`)}`}
          onPress={appearance}
          testID="profile-appearance"
          style={(state) => [
            styles.row,
            styles.linkRow,
            { borderTopColor: color.border },
            hovered(state) ? { backgroundColor: color.surfaceSunken } : null,
          ]}
        >
          <Text variant="label" tone="muted">
            {t("settings.appearance")}
          </Text>
          <View style={styles.end}>
            <Text variant="label" weight="medium" numberOfLines={1} style={styles.value}>
              {`${t(`settings.theme.${prefs.theme}`)} · ${t(`lang.${locale}`)}`}
            </Text>
            {/* The chevron glyph points down: turn it toward the end of the line. */}
            <View style={{ transform: [{ rotate: rtl ? "90deg" : "-90deg" }] }}>
              <Icon name="chevron" size={14} color={color.textMuted} />
            </View>
          </View>
        </Pressable>
        {shortcuts.length > 0 ? (
          <View
            testID="profile-shortcuts"
            style={[styles.section, { borderTopColor: color.border }]}
          >
            <Text variant="label" weight="semibold" accessibilityRole="header">
              {t("profile.shortcuts")}
            </Text>
            {shortcuts.map(([label, combo]) => (
              <View key={label} style={styles.keyRow}>
                <Text variant="label" tone="muted" style={styles.flexText}>
                  {label}
                </Text>
                <View style={[styles.keycap, { borderColor: color.border }]}>
                  <Text variant="label" tone="muted">{`${LRI}${combo}${PDI}`}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
        <View
          testID="profile-signout-divider"
          style={[styles.divider, { backgroundColor: color.border }]}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onClose();
            void signOut();
          }}
          testID="profile-signout"
          style={(state) => [
            styles.signOut,
            hovered(state) || state.pressed ? { backgroundColor: color.surfaceSunken } : null,
          ]}
        >
          <Text variant="secondary" weight="medium" color={color.danger}>
            {t("profile.signOut")}
          </Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: StyleSheet.absoluteFill,
  sheet: {
    position: "absolute",
    bottom: space.xxxl + space.xl,
    width: 320,
    maxWidth: "92%",
    padding: space.lg,
    gap: space.sm,
    borderRadius: radius.sheet,
  },
  head: { flexDirection: "row", alignItems: "center", gap: space.md, marginBottom: space.sm },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  flex: { flex: 1, minWidth: 0, gap: space.xs, alignItems: "flex-start" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: space.md,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  value: { flexShrink: 1, textAlign: "right" },
  linkRow: {
    alignItems: "center",
    paddingBottom: space.xs,
    marginHorizontal: -space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
  },
  end: { flexDirection: "row", alignItems: "center", gap: space.xs, flexShrink: 1 },
  section: { gap: space.xs, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  keyRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  flexText: { flex: 1, minWidth: 0 },
  keycap: {
    paddingHorizontal: space.xs + 2,
    paddingVertical: 1,
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  divider: { height: StyleSheet.hairlineWidth, marginTop: space.xs },
  // Sign out stands apart: a full-width row in the danger colour, not one button among others.
  signOut: {
    minHeight: minTouchTarget,
    justifyContent: "center",
    marginHorizontal: -space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.lg,
  },
});
