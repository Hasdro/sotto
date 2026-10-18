import { radius, SuggestionCard, space, Text, useTheme } from "@sotto/ui";
import { StyleSheet, View } from "react-native";
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
    minHeight: 200,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderStyle: "dashed",
    padding: space.xl,
    gap: space.sm,
    justifyContent: "center",
  },
  bars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    height: 24,
    marginBottom: space.sm,
  },
  barMark: { width: 4, borderRadius: radius.pill },
});
