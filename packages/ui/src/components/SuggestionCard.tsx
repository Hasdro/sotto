/**
 * The hero of the product (DESIGN.md §5): one suggestion, read at arm's length in one second.
 *
 * Text arrives as a stream; the component renders whatever it is given with no entrance
 * animation, so the first delta is visible on the very next frame (R1). A caret marks a card
 * that is still streaming; it disappears when `done` is true.
 */
import { StyleSheet, View } from "react-native";
import { useDirection, useTheme } from "../theme.tsx";
import { type CardKind, layout, radius, size as sizes, space } from "../tokens.ts";
import { Text } from "./Text.tsx";

/** Mirrors the card protocol's `source` (packages/shared card.ts). */
export type SuggestionSource = "playbook" | "ai" | "backup" | "holding";

export type SuggestionCardStrings = {
  /** e.g. "Answer", "Ask next". */
  type: string;
  /** e.g. "From your playbook", "AI answer". */
  source: string;
  /** Shown for ai/backup cards when the worker sent no label (R2). */
  notInPlaybook: string;
  /** Screen-reader suffix while text is still arriving. */
  streaming: string;
};

export type SuggestionCardProps = {
  type: CardKind;
  source: SuggestionSource;
  text: string;
  done: boolean;
  /** The worker's label (already localised). Wins over the built-in notice text. */
  label?: string | null;
  variant?: "hero" | "compact";
  /** Hero only: the larger type size used from the wide breakpoint up. */
  wide?: boolean;
  strings: SuggestionCardStrings;
  /** Hero only: a quiet line under the text, e.g. the measured delay. */
  footnote?: string | null;
  testID?: string;
};

const GLYPH: Record<CardKind, string> = {
  answer: "“",
  question: "?",
  objection: "≠",
  signal: "↗",
  warning: "!",
  holding: "…",
};

/** Glyphs that point a direction are mirrored in RTL (DESIGN.md §8). */
const GLYPH_RTL: Partial<Record<CardKind, string>> = { answer: "”", question: "؟", signal: "↖" };

/** Whether the R2 notice shows, and its text. */
export function noticeFor(
  source: SuggestionSource,
  label: string | null | undefined,
  fallback: string,
): string | null {
  if (label) return label;
  return source === "ai" || source === "backup" ? fallback : null;
}

export function SuggestionCard({
  type,
  source,
  text,
  done,
  label,
  variant = "hero",
  wide = false,
  strings,
  footnote,
  testID,
}: SuggestionCardProps) {
  const theme = useTheme();
  const direction = useDirection();
  const c = theme.card[type];
  const notice = noticeFor(source, label, strings.notInPlaybook);
  const holding = type === "holding" || source === "holding";
  const glyph = direction === "rtl" ? (GLYPH_RTL[type] ?? GLYPH[type]) : GLYPH[type];
  const a11yLabel = [strings.type, notice, text, done ? null : strings.streaming]
    .filter(Boolean)
    .join(". ");

  if (variant === "compact") {
    return (
      <View
        testID={testID}
        accessible
        accessibilityLabel={a11yLabel}
        style={[
          styles.compact,
          { backgroundColor: theme.color.surface, borderColor: theme.color.border },
          { borderStartColor: c.accent },
        ]}
      >
        <View style={styles.compactMeta}>
          <Disc glyph={glyph} fill={c.accent} ink={c.fill} size={sizes.iconSm} />
          <Text variant="label" weight="medium" tone="muted">
            {strings.type}
          </Text>
          {notice ? (
            <Text variant="label" tone="muted" numberOfLines={1} style={styles.shrink}>
              {notice}
            </Text>
          ) : null}
        </View>
        <Text variant="cardCompact" numberOfLines={2}>
          {text}
        </Text>
      </View>
    );
  }

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={a11yLabel}
      aria-busy={!done}
      style={[
        styles.hero,
        { backgroundColor: c.fill },
        holding
          ? { borderColor: c.accent, borderStyle: "dashed", borderWidth: sizes.stroke }
          : { borderStartColor: c.accent, borderStartWidth: sizes.voiceBar },
      ]}
    >
      <View style={styles.meta}>
        <Disc glyph={glyph} fill={c.accent} ink={c.fill} size={sizes.iconMd} />
        <Text variant="heading" weight="semibold" color={c.text} style={styles.grow}>
          {strings.type}
        </Text>
        <Text variant="label" weight="medium" color={c.muted}>
          {strings.source}
        </Text>
      </View>
      {notice ? (
        <View
          testID={testID ? `${testID}-notice` : undefined}
          style={[
            styles.notice,
            { backgroundColor: theme.color.noticeFill, borderColor: theme.color.noticeBorder },
          ]}
        >
          <Text variant="label" weight="medium" tone="notice">
            {notice}
          </Text>
        </View>
      ) : null}
      <Text variant={wide ? "cardWide" : "card"} weight="medium" color={c.text}>
        {text}
        {done ? null : (
          <Text variant={wide ? "cardWide" : "card"} color={c.accent} testID="card-caret">
            {" ▍"}
          </Text>
        )}
      </Text>
      {footnote ? (
        <Text variant="label" color={c.muted}>
          {footnote}
        </Text>
      ) : null}
    </View>
  );
}

function Disc({
  glyph,
  fill,
  ink,
  size,
}: {
  glyph: string;
  fill: string;
  ink: `#${string}`;
  size: number;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.disc, { width: size, height: size, backgroundColor: fill }]}
    >
      <Text
        variant={size >= sizes.iconMd ? "body" : "label"}
        weight="semibold"
        color={ink}
        style={{ lineHeight: size }}
      >
        {glyph}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radius.xl,
    padding: space.xl,
    gap: space.md,
    minHeight: layout.heroMinHeight,
  },
  meta: { flexDirection: "row", alignItems: "center", gap: space.sm },
  grow: { flex: 1 },
  shrink: { flexShrink: 1 },
  notice: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  compact: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStartWidth: sizes.bar,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: space.xs,
  },
  compactMeta: { flexDirection: "row", alignItems: "center", gap: space.sm },
  disc: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
});
