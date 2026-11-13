/**
 * The profile popup (owner, 21 Oct): opens from the person's name in the menu and shows who is
 * signed in, their company and plan, with quick links to Account and Settings and Sign out.
 */
import { Badge, Button, radius, space, Text, useGlassStyle, useTheme } from "@sotto/ui";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from "react-native";
import { signOut } from "../lib/cloud";
import { useI18n } from "../lib/locale";
import { useCloud } from "../lib/useCloud";

export function ProfilePopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { color, card } = useTheme();
  const glass = useGlassStyle({ elevated: true });
  const { t } = useI18n();
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
  const go = (href: "/account" | "/settings") => {
    onClose();
    router.push(href);
  };
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
        <View style={styles.actions}>
          <Button variant="secondary" label={t("nav.account")} onPress={() => go("/account")} />
          <Button variant="secondary" label={t("nav.settings")} onPress={() => go("/settings")} />
          <Button
            variant="ghost"
            label={t("profile.signOut")}
            onPress={() => {
              onClose();
              void signOut();
            }}
            testID="profile-signout"
          />
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: StyleSheet.absoluteFill,
  sheet: {
    position: "absolute",
    left: space.lg,
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
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
});
