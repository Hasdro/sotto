/** Mock role switch (P3.5): shows the app as an agent, a sales manager or a company admin sees it. */
import { SegmentedControl, space, Text } from "@sotto/ui";
import { StyleSheet, View } from "react-native";
import { useI18n } from "../lib/locale";
import { useRole, VIEW_ROLES } from "../lib/role";

export function RoleSwitch() {
  const { t } = useI18n();
  const { role, setRole } = useRole();
  return (
    <View style={styles.wrap}>
      <Text variant="label" tone="muted">
        {t("role.switch")}
      </Text>
      <SegmentedControl
        options={VIEW_ROLES.map((r) => ({ value: r, label: t(`role.short.${r}`) }))}
        value={role}
        onChange={setRole}
        accessibilityLabel={t("role.switch")}
        testID="role-switch"
      />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { gap: space.xs } });
