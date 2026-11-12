import { createElement } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useTheme } from "../theme.tsx";
import { space } from "../tokens.ts";
import { Text } from "./Text.tsx";

/**
 * The brand symbol (T-048, owner's pick 12 Nov 2026): direction (c), a solid shield with a
 * handset cut out of it (docs/design/logo/c.svg). Geometry on a 64-unit grid; the colour is a
 * theme token, passed in. The cut-out is a mask, so it shows whatever is behind the mark.
 */
export function symbolSvg(ink: string): string {
  const handset =
    `<g fill="#000"><rect x="6.5" y="8.5" width="21" height="14" rx="6.5" transform="rotate(-38 17 15.5)"/>` +
    `<rect x="36.5" y="41.5" width="21" height="14" rx="6.5" transform="rotate(-52 47 48.5)"/></g>` +
    `<path d="M15 17 C9 33 23 51 46 50" fill="none" stroke="#000" stroke-width="10" stroke-linecap="round"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><mask id="cut">` +
    `<rect width="64" height="64" fill="#fff"/><g transform="translate(14.5 14.5) scale(0.55)">${handset}</g>` +
    `</mask></defs><path d="M32 3 L57 11 V29 C57 45 46.5 55 32 61 C17.5 55 7 45 7 29 V11 Z" ` +
    `fill="${ink}" mask="url(#cut)"/></svg>`
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
