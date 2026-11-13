/**
 * Quiet Paper Glass building blocks for the redesign (D-037, DESIGN-SYSTEM §4): the glass surface
 * for floating chrome, the page header, the sidebar nav row, the list row with a round icon, and
 * the skeleton block. Small and token-only, so app screens compose them instead of styling Views.
 */
import { type ReactNode, useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  Pressable,
  type StyleProp,
  StyleSheet,
  View,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { useTheme } from "../theme.tsx";
import { layout, minTouchTarget, motion, radius, size, space } from "../tokens.ts";
import { isHovered } from "./Button.tsx";
import { useFocusRing } from "./focus.ts";
import { useGlassStyle } from "./glass.ts";
import { Icon, type IconName } from "./Icon.tsx";
import { Text } from "./Text.tsx";

/** Floating chrome only: top-bar pills, the composer, a floating toolbar. Never a content card. */
export function GlassSurface({
  children,
  shape = "pill",
  elevated = false,
  style,
  ...rest
}: ViewProps & {
  /** pill: header pills and toolbars · composer: the 32 px capsule · sheet: 24 px panels. */
  shape?: "pill" | "composer" | "sheet";
  elevated?: boolean;
}) {
  const glass = useGlassStyle({ elevated });
  const r = shape === "pill" ? radius.pill : shape === "composer" ? radius.composer : radius.sheet;
  return (
    <View {...rest} style={[{ borderRadius: r }, glass, style]}>
      {children}
    </View>
  );
}

/** The one page title per screen (34 px, w600) with an optional lead line and trailing actions. */
export function PageHeader({
  title,
  lead,
  actions,
  compact = false,
  testID,
}: {
  title: string;
  lead?: string | undefined;
  /** At most one primary Button here (one primary per view). */
  actions?: ReactNode;
  /** Phone width: the title drops to the 24 px role. */
  compact?: boolean;
  testID?: string | undefined;
}) {
  return (
    <View testID={testID} style={styles.header}>
      <View style={styles.headerText}>
        <Text
          variant={compact ? "title" : "pageTitle"}
          weight="semibold"
          accessibilityRole="header"
        >
          {title}
        </Text>
        {lead ? <Text variant="heading">{lead}</Text> : null}
      </View>
      {actions ? <View style={styles.headerActions}>{actions}</View> : null}
    </View>
  );
}

/** A sidebar navigation row: 12 px radius, a quiet gray fill when current, never a colour. */
export function NavRow({
  label,
  icon,
  current = false,
  onPress,
  trailing,
  testID,
}: {
  label: string;
  icon?: IconName | undefined;
  current?: boolean;
  onPress?: (() => void) | undefined;
  /** e.g. an unread dot or a count. */
  trailing?: ReactNode;
  testID?: string | undefined;
}) {
  const { color } = useTheme();
  const focus = useFocusRing();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityState={{ selected: current }}
      aria-current={current ? "page" : undefined}
      onPress={onPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      style={(state) => [
        styles.nav,
        current || isHovered(state) ? { backgroundColor: color.surfaceSunken } : null,
        focus.ring,
      ]}
    >
      {icon ? <Icon name={icon} size={18} color={color.text} /> : null}
      <Text
        variant="body"
        weight={current ? "medium" : "regular"}
        numberOfLines={1}
        style={styles.grow}
      >
        {label}
      </Text>
      {trailing}
    </Pressable>
  );
}

/** A list row: 44 px round icon, title, up to three lines of description, a trailing slot. */
export function ListRow({
  title,
  description,
  icon,
  leading,
  trailing,
  onPress,
  testID,
}: {
  title: string;
  description?: string | undefined;
  icon?: IconName | undefined;
  /** Replaces the round icon, e.g. an avatar. */
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: (() => void) | undefined;
  testID?: string | undefined;
}) {
  const { color } = useTheme();
  const focus = useFocusRing();
  const body = (
    <>
      {leading ??
        (icon ? (
          <View style={[styles.rowIcon, { backgroundColor: color.surfaceSunken }]}>
            <Icon name={icon} size={20} color={color.text} />
          </View>
        ) : null)}
      <View style={styles.grow}>
        <Text variant="body" weight="medium">
          {title}
        </Text>
        {description ? (
          <Text variant="secondary" tone="muted" numberOfLines={3}>
            {description}
          </Text>
        ) : null}
      </View>
      {trailing}
    </>
  );
  if (!onPress) {
    return (
      <View testID={testID} style={styles.row}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={description ? `${title}. ${description}` : title}
      onPress={onPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      style={(state) => [
        styles.row,
        styles.rowPressable,
        isHovered(state) ? { backgroundColor: color.surfaceSunken } : null,
        focus.ring,
      ]}
    >
      {body}
    </Pressable>
  );
}

/**
 * A loading block with the geometry of the content it stands for. A soft opacity pulse (the
 * reference's shimmer, simplified for native); static under reduced motion.
 */
export function Skeleton({
  width = "100%",
  height = 16,
  round = false,
  reduceMotion = false,
  style,
}: {
  width?: ViewStyle["width"];
  height?: number;
  round?: boolean;
  reduceMotion?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { color } = useTheme();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.55,
          duration: motion.layout * 2.5,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: motion.layout * 2.5,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height,
          borderRadius: round ? radius.pill : radius.md,
          backgroundColor: color.bubble,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: space.lg,
    maxWidth: layout.contentMaxWidth,
  },
  headerText: { gap: space.sm, flexShrink: 1, maxWidth: layout.readableMaxWidth },
  headerActions: { flexDirection: "row", alignItems: "center", gap: space.sm },
  nav: {
    minHeight: minTouchTarget,
    paddingHorizontal: space.sm,
    borderRadius: radius.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  grow: { flex: 1, minWidth: 0, gap: 2 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    paddingVertical: space.md,
  },
  rowPressable: { paddingHorizontal: space.sm, borderRadius: radius.lg },
  rowIcon: {
    width: size.rowIcon,
    height: size.rowIcon,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
