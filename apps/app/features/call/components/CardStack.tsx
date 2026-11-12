import {
  layout,
  Mascot,
  noticeFor,
  radius,
  SuggestionCard,
  size,
  space,
  Text,
  useReduceMotion,
  useTheme,
} from "@sotto/ui";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Pressable, StyleSheet, View } from "react-native";
import { formatNumber } from "../../../lib/i18n";
import { useI18n } from "../../../lib/locale";
import type { CardView } from "../../cards/reducer";
import { cardStrings } from "./strings";

/** Heights of the static "listening" mark (distinct, so they double as keys). */
const LISTEN_BARS = [10, 18, 12, 22, 14] as const;

/** Older cards shown under the hero; the rest stay in history. */
export const EARLIER_LIMIT = 4;

type Props = {
  cards: readonly CardView[];
  wide: boolean;
  listening: boolean;
  /** The customer is mid-sentence (a partial transcript is showing). */
  speaking?: boolean;
};

/**
 * The newest card large on top, older ones compact below (DESIGN.md §5). The hero slot keeps a
 * minimum height, so the first card replaces the placeholder without moving anything below it.
 */
export function CardStack({ cards, wide, listening, speaking = false }: Props) {
  const { t, locale } = useI18n();
  const [hero, ...earlier] = cards;
  // One older card open at a time (T-050 density rule); the rest stay at two lines.
  const [openId, setOpenId] = useState<string | null>(null);
  useAnnounceWhenDone(hero);
  const writing = Boolean(hero && !hero.done);
  return (
    <View style={styles.stack}>
      {listening && hero ? <Activity speaking={speaking} writing={writing} /> : null}
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
              : t("card.shownAfter", {
                  seconds: formatNumber(hero.shownAfterMs / 1000, locale, 2),
                })
          }
        />
      ) : listening ? (
        <Listening speaking={speaking} />
      ) : null}
      {earlier.length > 0 ? (
        <View style={styles.earlier}>
          <Text variant="label" weight="medium" tone="muted" accessibilityRole="header">
            {t("card.earlier")}
          </Text>
          {earlier.slice(0, EARLIER_LIMIT).map((c) => (
            <Dimmed
              key={c.id}
              testID={`earlier-${c.id}`}
              open={openId === c.id}
              label={t(openId === c.id ? "card.collapse" : "card.expand")}
              onToggle={() => setOpenId((id) => (id === c.id ? null : c.id))}
            >
              {(quiet) => (
                <SuggestionCard
                  variant="compact"
                  quiet={quiet}
                  type={c.type}
                  source={c.source}
                  label={c.label}
                  text={c.text}
                  done={c.done}
                  expanded={openId === c.id}
                  strings={cardStrings(t, c.type, c.source)}
                  testID={`earlier-${c.id}-card`}
                />
              )}
            </Dimmed>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Older cards step back so the newest stands out; hovering or focusing one brings it to full
 * strength (owner, 22 Oct). The step back is a colour change to the muted text token, not
 * opacity, so the sentence keeps WCAG AA contrast (T-050). Pressing one opens its whole
 * sentence; an open card stays at full strength.
 */
function Dimmed({
  children,
  testID,
  open,
  label,
  onToggle,
}: {
  children: (quiet: boolean) => ReactNode;
  testID?: string;
  open: boolean;
  label: string;
  onToggle: () => void;
}) {
  const [lit, setLit] = useState(false);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityHint={label}
      accessibilityState={{ expanded: open }}
      aria-expanded={open}
      onPress={onToggle}
      onHoverIn={() => setLit(true)}
      onHoverOut={() => setLit(false)}
      onFocus={() => setLit(true)}
      onBlur={() => setLit(false)}
    >
      {children(!(lit || open))}
    </Pressable>
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

/** What Sotto is doing right now, above the newest card (owner, 21 Oct: "see things in action"). */
function Activity({ speaking, writing }: { speaking: boolean; writing: boolean }) {
  const { t } = useI18n();
  const state = writing ? "thinking" : speaking ? "listening" : "idle";
  return (
    <View style={styles.activity} testID={`activity-${state}`} accessibilityLiveRegion="polite">
      <Mascot state={state} size={26} />
      <Text variant="label" weight="medium" tone="muted">
        {t(
          writing
            ? "call.activity.writing"
            : speaking
              ? "call.activity.speaking"
              : "call.listening",
        )}
      </Text>
    </View>
  );
}

function Bar({ h, i, fast }: { h: number; i: number; fast: boolean }) {
  const { color } = useTheme();
  const v = useRef(new Animated.Value(0)).current;
  const reduce = useReduceMotion();
  useEffect(() => {
    if (reduce) {
      v.setValue(0.5); // still bars of mixed height, no movement
      return;
    }
    const ms = fast ? 260 : 700;
    const a = Animated.loop(
      Animated.sequence([
        Animated.delay(i * 90),
        Animated.timing(v, { toValue: 1, duration: ms, useNativeDriver: false }),
        Animated.timing(v, { toValue: 0, duration: ms, useNativeDriver: false }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [fast, i, v, reduce]);
  return (
    <Animated.View
      style={[
        styles.barMark,
        {
          backgroundColor: color.primary,
          height: v.interpolate({
            inputRange: [0, 1],
            outputRange: [h * 0.4, h * (fast ? 1.4 : 1)],
          }),
        },
      ]}
    />
  );
}

function Listening({ speaking }: { speaking: boolean }) {
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
        <Mascot state="listening" size={40} />
        {LISTEN_BARS.map((h, i) => (
          <Bar key={h} h={h} i={i} fast={speaking} />
        ))}
      </View>
      <Text variant="heading" weight="semibold">
        {t(speaking ? "call.activity.speaking" : "call.listening")}
      </Text>
      <Text variant="body" tone="muted">
        {t("call.listeningBody")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.xl },
  activity: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: -space.md },
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
