import type { ReactNode } from "react";
import {
  Platform,
  Text as RNText,
  type TextProps as RNTextProps,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { useTheme } from "../theme.tsx";
import {
  type FontWeightName,
  fontFamily,
  type Hex,
  type Theme,
  type TypeRole,
  type,
  webFontFallback,
} from "../tokens.ts";

export type TextTone =
  | "default"
  | "muted"
  | "primary"
  | "onPrimary"
  | "danger"
  | "onDanger"
  | "positive"
  | "negative"
  | "notice"
  | "onInverse";

const toneColor = (theme: Theme, tone: TextTone): Hex => {
  const c = theme.color;
  const map: Record<TextTone, Hex> = {
    default: c.text,
    muted: c.textMuted,
    primary: c.primary,
    onPrimary: c.onPrimary,
    danger: c.danger,
    onDanger: c.onDanger,
    positive: c.positive,
    negative: c.negative,
    notice: c.noticeText,
    onInverse: c.onInverseSurface,
  };
  return map[tone];
};

/** fontFamily for a weight, with a system fallback stack on web (DESIGN.md §4). */
export function fontFor(weight: FontWeightName): TextStyle {
  const family = fontFamily[weight];
  return { fontFamily: Platform.OS === "web" ? `${family}, ${webFontFallback}` : family };
}

export type TextProps = Omit<RNTextProps, "style"> & {
  variant?: TypeRole;
  weight?: FontWeightName;
  tone?: TextTone;
  /** Overrides tone, e.g. card text colours. Must be a token value. */
  color?: Hex;
  style?: StyleProp<TextStyle>;
  children?: ReactNode;
};

/** The only text primitive: a type role from the scale, a weight and a colour token. */
export function Text({
  variant = "body",
  weight = "regular",
  tone = "default",
  color,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();
  return (
    <RNText
      {...rest}
      style={[type[variant], fontFor(weight), { color: color ?? toneColor(theme, tone) }, style]}
    />
  );
}
