import { Icon, type IconName, radius, space, Text, useTheme } from "@sotto/ui";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useIsWide } from "../lib/responsive";

/**
 * Title, one plain sentence of what the page is for, and optional actions on the end side.
 * Quiet Paper Glass (D-041, DESIGN-SYSTEM §4.12): 34 px w600 title on wide screens (24 px on a
 * phone), an 18 px lead; the section icon sits in a 44 px gray circle like a list-row icon.
 */
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
  const wide = useIsWide();
  return (
    <View style={styles.wrap}>
      <View style={styles.text}>
        <View style={styles.titleRow}>
          {icon ? (
            <View style={[styles.iconDisc, { backgroundColor: color.surfaceSunken }]}>
              <Icon name={icon} size={20} color={color.text} />
            </View>
          ) : null}
          <Text
            variant={wide ? "pageTitle" : "title"}
            weight="semibold"
            accessibilityRole="header"
            style={styles.title}
          >
            {title}
          </Text>
        </View>
        {subtitle ? (
          <Text variant={wide ? "heading" : "body"} tone="muted">
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
    marginBottom: space.xxl,
  },
  text: { flex: 1, minWidth: 220, gap: space.xs },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  title: { flexShrink: 1 },
  iconDisc: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
