/**
 * The hero of the product (DESIGN-SYSTEM §5.3): one suggestion, read at arm's length in one second.
 *
 * Quiet Paper Glass (D-041): the hero is the reference's message bubble (22 px, one 6 px tail
 * corner at the bottom of the reading-start side, flat, no border, no shadow) filled with the one
 * accent, because it is the single primary thing in the live view. Warning is red; holding is a
 * pale neutral with a dashed outline. Nothing is printed above the sentence but the type's icon
 * (UX-12). Source and the R2 notice are one short line under the sentence, and the
 * card prints no timing (UX-11; R1 timing is logged per card, not shown to the agent).
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
  /** Shown for ai/backup cards when the worker sent no label (R2). Read in full by screen readers. */
  notInPlaybook: string;
  /** The visible form of the R2 notice under the sentence, e.g. "Not in playbook — check first". */
  notInPlaybookShort?: string;
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
  /** Compact only: show the whole sentence instead of two lines (one card open at a time). */
  expanded?: boolean;
  /** Compact only: an older card stepping back; the sentence uses the muted text token. */
  quiet?: boolean;
  /**
   * Compact only: name the card's type and source in the line under the sentence ("Answer ·
   * From your playbook"). For History (UX-010), where the edge colours have no legend.
   */
  labelled?: boolean;
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
  expanded = false,
  quiet = false,
  labelled = false,
  testID,
}: SuggestionCardProps) {
  const theme = useTheme();
  const direction = useDirection();
  const c = theme.card[type];
  const holding = type === "holding" || source === "holding";
  const notice = noticeFor(source, label, strings.notInPlaybook);
  // The visible line: the worker's label, else the short built-in notice (R2).
  const shown = noticeFor(source, label, strings.notInPlaybookShort ?? strings.notInPlaybook);
  const sourceLine = notice || holding ? null : strings.source;
  const glyph = direction === "rtl" ? (GLYPH_RTL[type] ?? GLYPH[type]) : GLYPH[type];
  const id = (part: string) => (testID ? `${testID}-${part}` : undefined);
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
          { backgroundColor: theme.color.background, borderColor: theme.color.border },
          holding
            ? { borderColor: c.accent, borderStyle: "dashed", borderStartWidth: sizes.stroke }
            : { borderStartColor: c.accent },
        ]}
      >
        <Disc glyph={glyph} fill={c.accent} ink={c.fill} size={sizes.iconSm} />
        <View style={styles.compactBody}>
          <Text
            variant="cardCompact"
            tone={quiet ? "muted" : "default"}
            numberOfLines={expanded ? undefined : 2}
          >
            {text}
          </Text>
          {labelled ? (
            <Text variant="label" tone="muted" testID={id("kind")}>
              <Text variant="label" weight="semibold" tone="muted">
                {strings.type}
              </Text>
              {shown || sourceLine ? ` · ${shown ?? sourceLine}` : ""}
            </Text>
          ) : shown ? (
            <Text variant="label" tone="muted" numberOfLines={1}>
              {shown}
            </Text>
          ) : null}
        </View>
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
        { backgroundColor: c.heroFill },
        holding
          ? { borderColor: c.accent, borderStyle: "dashed", borderWidth: sizes.stroke }
          : null,
      ]}
    >
      <View testID={id("meta")} style={styles.meta}>
        <Disc glyph={glyph} fill={c.heroText} ink={c.heroFill} size={sizes.iconMd} />
      </View>
      <Text
        testID={id("text")}
        variant={wide ? "cardWide" : "card"}
        weight="medium"
        color={c.heroText}
      >
        {text}
        {done ? null : (
          <Text variant={wide ? "cardWide" : "card"} color={c.heroMuted} testID="card-caret">
            {" ▍"}
          </Text>
        )}
      </Text>
      {shown ? (
        <View
          testID={id("notice")}
          style={[
            styles.notice,
            { backgroundColor: theme.color.noticeFill, borderColor: theme.color.noticeBorder },
          ]}
        >
          <Text variant="label" weight="medium" tone="notice">
            {shown}
          </Text>
        </View>
      ) : null}
      {sourceLine ? (
        <Text testID={id("source")} variant="label" weight="medium" color={c.heroMuted}>
          {sourceLine}
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
    borderBottomStartRadius: radius.sm,
    padding: space.xl,
    gap: space.md,
    minHeight: layout.heroMinHeight,
  },
  meta: { flexDirection: "row", alignItems: "center", gap: space.sm },
  notice: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  compact: {
    borderRadius: radius.lg,
    borderBottomStartRadius: radius.sm,
    borderWidth: 1,
    borderStartWidth: sizes.bar,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
  },
  compactBody: { flex: 1, gap: space.xs },
  disc: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
});
