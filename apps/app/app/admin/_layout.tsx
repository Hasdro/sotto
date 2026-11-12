/** Admin area (R3, R6): team, keys and models, settings. The prompt studio and a separate models
 * table return when they are real (T-040, T-041). */

import { Icon, type IconName, layout, minTouchTarget, space, Text, useTheme } from "@sotto/ui";
import { Slot, usePathname } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { AppLink } from "../../components/AppLink";
import { PageHeader } from "../../components/PageHeader";
import { RoleGate } from "../../components/RoleGate";
import type { StringKey } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";

const TABS: readonly { href: string; label: StringKey; icon: IconName }[] = [
  { href: "/admin", label: "admin.team", icon: "users" },
  { href: "/admin/keys", label: "admin.keys", icon: "key" },
  { href: "/admin/settings", label: "admin.settings", icon: "settings" },
  { href: "/admin/features", label: "admin.features", icon: "shield" },
  { href: "/admin/recordings", label: "admin.recordings", icon: "headphones" },
  { href: "/admin/devices", label: "admin.devices", icon: "laptop" },
  { href: "/admin/activity", label: "admin.activity", icon: "list" },
];

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
  return (
    <ScrollView style={{ backgroundColor: color.background }} contentContainerStyle={styles.page}>
      <View style={styles.column}>
        <PageHeader icon="admin" title={t("admin.title")} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.tabsWrap, { borderBottomColor: color.border }]}
          contentContainerStyle={styles.tabs}
          accessibilityLabel={t("admin.tabs")}
        >
          {TABS.map((tab) => {
            const active =
              tab.href === "/admin" ? pathname === tab.href : pathname.startsWith(tab.href);
            return (
              <AppLink
                key={tab.href}
                href={tab.href}
                accessibilityRole="link"
                accessibilityState={{ selected: active }}
                aria-current={active ? "page" : undefined}
                style={StyleSheet.flatten([
                  styles.tab,
                  { borderBottomColor: active ? color.primary : "transparent" },
                ])}
              >
                <View style={styles.tabInner}>
                  <Icon
                    name={tab.icon}
                    size={18}
                    color={active ? color.primary : color.textMuted}
                  />
                  <Text
                    variant="body"
                    weight={active ? "semibold" : "regular"}
                    tone={active ? "primary" : "muted"}
                  >
                    {t(tab.label)}
                  </Text>
                </View>
              </AppLink>
            );
          })}
        </ScrollView>
        <Slot />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, paddingTop: space.xl, flexGrow: 1 },
  column: { width: "100%", maxWidth: layout.contentMaxWidth - 120, alignSelf: "center" },
  tabsWrap: { borderBottomWidth: 1, marginBottom: space.xl, flexGrow: 0 },
  tabs: { gap: space.lg },
  tabInner: { flexDirection: "row", alignItems: "center", gap: space.xs },
  tab: {
    minHeight: minTouchTarget,
    justifyContent: "center",
    borderBottomWidth: 2,
    marginBottom: -1,
  },
});
