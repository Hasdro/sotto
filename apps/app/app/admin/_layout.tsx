/** Admin area (R3, R6): team, prompts, models, settings. Mock data; real logic in Phases 5–6. */
import { layout, minTouchTarget, space, Text, useTheme } from "@sotto/ui";
import { Link, Slot, usePathname } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { PageHeader } from "../../components/PageHeader";
import { RoleGate } from "../../components/RoleGate";
import type { StringKey } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";

const TABS: readonly { href: string; label: StringKey }[] = [
  { href: "/admin", label: "admin.team" },
  { href: "/admin/prompts", label: "admin.prompts" },
  { href: "/admin/models", label: "admin.models" },
  { href: "/admin/settings", label: "admin.settings" },
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
        <PageHeader title={t("admin.title")} />
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
              <Link key={tab.href} href={tab.href} asChild>
                <Pressable
                  accessibilityRole="link"
                  accessibilityState={{ selected: active }}
                  aria-current={active ? "page" : undefined}
                  style={StyleSheet.flatten([
                    styles.tab,
                    { borderBottomColor: active ? color.primary : "transparent" },
                  ])}
                >
                  <Text
                    variant="body"
                    weight={active ? "semibold" : "regular"}
                    tone={active ? "primary" : "muted"}
                  >
                    {t(tab.label)}
                  </Text>
                </Pressable>
              </Link>
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
  tab: {
    minHeight: minTouchTarget,
    justifyContent: "center",
    borderBottomWidth: 2,
    marginBottom: -1,
  },
});
