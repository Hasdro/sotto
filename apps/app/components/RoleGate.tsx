/**
 * Role gate (R3): a gated area renders its page only for roles that may open it, and says why
 * otherwise. It wraps the area's screen or layout so the router's navigator stays mounted.
 */
import { EmptyState, space } from "@sotto/ui";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useI18n } from "../lib/locale";
import { type Area, ROLE_AREAS, useRole } from "../lib/role";

export function RoleGate({ area, children }: { area: Area; children: ReactNode }) {
  const { role } = useRole();
  return ROLE_AREAS[role].includes(area) ? children : <NoAccess />;
}

export function NoAccess() {
  const { t } = useI18n();
  const { role } = useRole();
  return (
    <View style={styles.wrap}>
      <EmptyState
        testID="no-access"
        title={t("role.noAccess.title")}
        body={t("role.noAccess.body", { role: t(`role.${role}`) })}
        action={{ label: t("role.noAccess.action"), onPress: () => router.replace("/call") }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "center", padding: space.xl },
});
