import { Icon, type IconName, space, Text, useTheme } from "@sotto/ui";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

/** Title, one plain sentence of what the page is for, and optional actions on the end side. */
export function PageHeader({
  title,
  subtitle,
  actions,
  icon,
}: {
  title: string;
  /** Sotto's own icon before the title (owner, 22 Oct). */
  icon?: IconName;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const { color } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={styles.text}>
        <View style={styles.titleRow}>
          {icon ? <Icon name={icon} size={26} color={color.textMuted} /> : null}
          <Text variant="title" weight="semibold" accessibilityRole="header">
            {title}
          </Text>
        </View>
        {subtitle ? (
          <Text variant="body" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actions}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: space.md,
    marginBottom: space.xl,
  },
  text: { flex: 1, minWidth: 220, gap: space.xs },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
