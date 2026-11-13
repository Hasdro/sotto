import type { ReactNode } from "react";
import {
  ScrollView,
  type StyleProp,
  StyleSheet,
  View,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { useTheme } from "../theme.tsx";
import { layout, radius, space } from "../tokens.ts";

type Space = keyof typeof space;

/** A full-height page on the background colour. `scroll` for long pages; `padded` adds the gutter. */
export function Screen({
  children,
  scroll = false,
  padded = true,
  maxWidth,
  testID,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  /** Centres the content column at this width (e.g. layout.readableMaxWidth). */
  maxWidth?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { color } = useTheme();
  const inner = [
    padded ? styles.padded : null,
    maxWidth ? { width: "100%" as const, maxWidth, alignSelf: "center" as const } : null,
    style,
  ];
  if (scroll) {
    return (
      <ScrollView
        testID={testID}
        style={[styles.fill, { backgroundColor: color.background }]}
        contentContainerStyle={[styles.grow, ...inner]}
      >
        {children}
      </ScrollView>
    );
  }
  return (
    <View testID={testID} style={[styles.fill, { backgroundColor: color.background }, ...inner]}>
      {children}
    </View>
  );
}

/** Flex column or row with a gap from the spacing scale. */
export function Stack({
  children,
  gap = "md",
  direction = "column",
  align,
  justify,
  wrap = false,
  style,
  ...rest
}: ViewProps & {
  gap?: Space;
  direction?: "column" | "row";
  align?: ViewStyle["alignItems"];
  justify?: ViewStyle["justifyContent"];
  wrap?: boolean;
}) {
  return (
    <View
      {...rest}
      style={[
        {
          flexDirection: direction,
          gap: space[gap],
          alignItems: align,
          justifyContent: justify,
          flexWrap: wrap ? "wrap" : "nowrap",
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * A surface for grouping content: the reference's outlined card (paper fill, hairline, 22 px) or,
 * `sunken`, a flat gray well with no border. Never a shadow.
 */
export function Panel({
  children,
  sunken = false,
  padded = true,
  style,
  ...rest
}: ViewProps & { sunken?: boolean; padded?: boolean }) {
  const { color } = useTheme();
  return (
    <View
      {...rest}
      style={[
        styles.panel,
        {
          backgroundColor: sunken ? color.surfaceSunken : color.surface,
          borderColor: sunken ? color.surfaceSunken : color.border,
        },
        padded ? styles.panelPadded : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Divider() {
  const { color } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: color.border }} />;
}

export { layout };

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flexGrow: 1 },
  padded: { padding: space.lg },
  panel: { borderRadius: radius.xl, borderWidth: 1, overflow: "hidden" },
  panelPadded: { padding: space.lg },
});
