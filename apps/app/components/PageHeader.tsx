import { space, Text } from "@sotto/ui";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

/** Title, one plain sentence of what the page is for, and optional actions on the end side. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.text}>
        <Text variant="title" weight="semibold" accessibilityRole="header">
          {title}
        </Text>
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
});
