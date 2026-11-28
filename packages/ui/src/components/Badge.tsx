import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme.tsx";
import { type CardKind, type Hex, radius, size, space } from "../tokens.ts";
import { Text } from "./Text.tsx";

/** Card-type tones reuse the card palettes, so "approximate" (objection amber) reads as caution. */
export type BadgeTone = CardKind | "neutral" | "primary" | "notice";

export type BadgeProps = {
  label: string;
  tone?: BadgeTone;
  /** A leading dot, e.g. the live indicator. */
  dot?: boolean;
  /** Allow long labels (e.g. Setup guide test results) to wrap inside narrow cards. */
  wrap?: boolean;
  testID?: string;
};

export function Badge({ label, tone = "neutral", dot = false, wrap = false, testID }: BadgeProps) {
  const theme = useTheme();
  const tones: Record<BadgeTone, { fill: Hex; text: Hex; dot: Hex }> = {
    neutral: {
      fill: theme.color.surfaceSunken,
      text: theme.color.text,
      dot: theme.color.textMuted,
    },
    primary: { fill: theme.color.primary, text: theme.color.onPrimary, dot: theme.color.onPrimary },
    notice: {
      fill: theme.color.noticeFill,
      text: theme.color.noticeText,
      dot: theme.color.noticeBorder,
    },
    answer: { ...pick(theme.card.answer) },
    question: { ...pick(theme.card.question) },
    signal: { ...pick(theme.card.signal) },
    objection: { ...pick(theme.card.objection) },
    warning: { ...pick(theme.card.warning) },
    holding: { ...pick(theme.card.holding) },
  };
  const t = tones[tone];
  return (
    <View
      testID={testID}
      style={[styles.badge, wrap ? styles.wrapBadge : null, { backgroundColor: t.fill }]}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: t.dot }]} /> : null}
      <Text
        variant="label"
        weight="medium"
        color={t.text}
        numberOfLines={wrap ? undefined : 1}
        style={styles.label}
      >
        {label}
      </Text>
    </View>
  );
}

function pick(c: { fill: Hex; text: Hex; accent: Hex }) {
  return { fill: c.fill, text: c.text, dot: c.accent };
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    maxWidth: "100%",
    flexShrink: 1,
    gap: space.xs + 2,
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.xs - 1,
    borderRadius: radius.pill,
  },
  wrapBadge: {
    borderRadius: radius.md,
  },
  label: {
    flexShrink: 1,
  },
  dot: { width: size.dot, height: size.dot, borderRadius: radius.pill },
});
