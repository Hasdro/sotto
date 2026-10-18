import { layout, noticeFor, radius, SuggestionCard, size, space, Text, useTheme } from "@sotto/ui";
import { useEffect, useRef } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import { formatNumber } from "../../../lib/i18n";
import { useI18n } from "../../../lib/locale";
import type { CardView } from "../../cards/reducer";
import { cardStrings } from "./strings";

/** Heights of the static "listening" mark (distinct, so they double as keys). */
const LISTEN_BARS = [10, 18, 12, 22, 14] as const;

/** Older cards shown under the hero; the rest stay in history. */
export const EARLIER_LIMIT = 4;

type Props = { cards: readonly CardView[]; wide: boolean; listening: boolean };

/**
 * The newest card large on top, older ones compact below (DESIGN.md §5). The hero slot keeps a
 * minimum height, so the first card replaces the placeholder without moving anything below it.
 */
export function CardStack({ cards, wide, listening }: Props) {
  const { t, locale } = useI18n();
  const [hero, ...earlier] = cards;
  useAnnounceWhenDone(hero);
  return (
    <View style={styles.stack}>
      {hero ? (
        <SuggestionCard
          key={hero.id}
          testID="hero-card"
          type={hero.type}
          source={hero.source}
          label={hero.label}
          text={hero.text}
          done={hero.done}
          wide={wide}
          strings={cardStrings(t, hero.type, hero.source)}
          footnote={
            hero.shownAfterMs === null
              ? null
              : t("card.shownAfter", { seconds: formatNumber(hero.shownAfterMs / 1000, locale, 2) })
          }
        />
      ) : listening ? (
        <Listening />
      ) : null}
      {earlier.length > 0 ? (
        <View style={styles.earlier}>
          <Text variant="label" weight="medium" tone="muted" accessibilityRole="header">
            {t("card.earlier")}
          </Text>
          {earlier.slice(0, EARLIER_LIMIT).map((c) => (
            <SuggestionCard
              key={c.id}
              variant="compact"
              type={c.type}
              source={c.source}
              label={c.label}
              text={c.text}
              done={c.done}
              strings={cardStrings(t, c.type, c.source)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Screen readers hear each hero card once, when it is complete (DESIGN.md §9). Announcing the
 * first delta would read a fragment ("Ask what") and cut off the rest; deltas stream in well
 * under a second, so waiting for `done` costs little and gives one whole sentence.
 */
function useAnnounceWhenDone(hero: CardView | undefined) {
  const { t } = useI18n();
  const announced = useRef(new Set<string>());
  const label = hero
    ? [
        t(`card.type.${hero.type}`),
        noticeFor(hero.source, hero.label, t("card.notInPlaybook")),
        hero.text,
      ]
        .filter(Boolean)
        .join(". ")
    : "";
  const ready = hero?.done === true && !announced.current.has(hero.id);
  const id = hero?.id;
  useEffect(() => {
    if (!ready || !id || announced.current.has(id)) return;
    announced.current.add(id);
    AccessibilityInfo.announceForAccessibility(label);
  }, [ready, id, label]);
}

function Listening() {
  const { color } = useTheme();
  const { t } = useI18n();
  return (
    <View
      testID="listening"
      accessibilityRole="summary"
      style={[styles.listening, { borderColor: color.borderStrong }]}
    >
      <View
        style={styles.bars}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {LISTEN_BARS.map((h) => (
          <View key={h} style={[styles.barMark, { height: h, backgroundColor: color.primary }]} />
        ))}
      </View>
      <Text variant="heading" weight="semibold">
        {t("call.listening")}
      </Text>
      <Text variant="body" tone="muted">
        {t("call.listeningBody")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.xl },
  earlier: { gap: space.sm },
  listening: {
    minHeight: layout.heroMinHeight,
    borderRadius: radius.xl,
    borderWidth: size.stroke,
    borderStyle: "dashed",
    padding: space.xl,
    gap: space.sm,
    justifyContent: "center",
  },
  bars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.xs,
    height: size.listenMark,
    marginBottom: space.sm,
  },
  barMark: { width: size.bar, borderRadius: radius.pill },
});
