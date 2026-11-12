import { createElement } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useTheme } from "../theme.tsx";
import { space } from "../tokens.ts";
import { Text } from "./Text.tsx";

/**
 * The brand symbol (T-048): direction (a), a handset bent into a shield, as a placeholder until
 * the owner picks one of docs/design/logo/index.html. Geometry on a 64-unit grid; the colour is a
 * theme token, passed in. Swap this string when the owner chooses another direction.
 */
export function symbolSvg(ink: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g fill="${ink}">` +
    `<rect x="4" y="7" width="22" height="12" rx="6.5" transform="rotate(-6 15 13.5)"/>` +
    `<rect x="38" y="7" width="22" height="12" rx="6.5" transform="rotate(6 49 13.5)"/></g>` +
    `<path d="M15 17 V30 C15 40 22 48.5 32 55.5 C42 48.5 49 40 49 30 V17" fill="none" ` +
    `stroke="${ink}" stroke-width="8.5" stroke-linejoin="miter" stroke-miterlimit="8" ` +
    `stroke-linecap="round"/></svg>`
  );
}

/** The symbol as an image, sized in px. Web and desktop only (React Native has no SVG image). */
export function BrandSymbol({ size = 28 }: { size?: number }) {
  const { color } = useTheme();
  if (Platform.OS !== "web") return null;
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(symbolSvg(color.primary))}`;
  // A plain <img> on web: react-native-web's Image does not draw SVG data URIs reliably.
  return createElement("img", { src, width: size, height: size, alt: "", "aria-hidden": true });
}

/**
 * AGN Sales Shield (D-026): the symbol, then the name. "AGN" sits small above "Sales Shield",
 * so the short form carries the weight; screen readers hear the full name once.
 */
export function Wordmark({ name, compact = false }: { name: string; compact?: boolean }) {
  const prefix = name.startsWith("AGN ") ? "AGN" : null;
  const main = prefix ? name.slice(4) : name;
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={name} style={styles.wrap}>
      <BrandSymbol size={compact ? 26 : 32} />
      <View>
        {prefix ? (
          <Text variant="label" weight="medium" tone="muted" style={styles.prefix}>
            {prefix}
          </Text>
        ) : null}
        <Text variant={compact ? "body" : "heading"} weight="semibold" tone="primary">
          {main}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: space.sm },
  prefix: { lineHeight: 14 },
});
