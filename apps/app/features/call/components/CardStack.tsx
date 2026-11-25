import type { CardSource, CardType } from "@sotto/shared";
import {
  Button,
  layout,
  noticeFor,
  radius,
  SuggestionCard,
  type SuggestionCardStrings,
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
import { RatingControls, useCanRate } from "../../rating/RatingControls";
import { useCallText } from "../strings";
import { cardStrings } from "./strings";

/** Heights of the static "listening" mark (distinct, so they double as keys). */
const LISTEN_BARS = [10, 18, 12, 22, 14] as const;

/** Splits optional `\nWHY: <insight>` (C1, D-094, D-100) from the main card line. */
export function splitCardWhy(text: string): { main: string; why: string | null } {
  const match = /(?:^|\n)\s*WHY:\s*/i.exec(text);
  if (!match) return { main: text.trim(), why: null };
  const main = text.slice(0, match.index).trim();
  const why = text.slice(match.index + match[0].length).trim();
  return { main, why: why || null };
}

const WHY_COPY = {
  en: { show: "Why?", hide: "Hide insight" },
  ar: { show: "لماذا؟", hide: "إخفاء الفكرة" },
} as const;

/** Older cards shown under the hero by default (UX-13); "Show earlier (n)" opens the rest. */
export const EARLIER_LIMIT = 2;

/** After leaving an older card, its rating buttons stay this long, so they can be reached. */
const UNLIT_DELAY_MS = 200;

const isHolding = (c: CardView) => c.type === "holding" || c.source === "holding";

/**
 * Older cards for the list under the hero: a holding card is dropped once a real card of the
 * same customer turn exists (UX-14; DESIGN §5 already replaces it in the hero).
 */
export function earlierCards(cards: readonly CardView[]): CardView[] {
  const [, ...earlier] = cards;
  return earlier.filter(
    (c) => !isHolding(c) || !cards.some((o) => o.turnKey === c.turnKey && !isHolding(o)),
  );
}

/** Card labels plus the short visible R2 line (UX-12). */
function useCardStrings(): (type: CardType, source: CardSource) => SuggestionCardStrings {
  const { t } = useI18n();
  const ct = useCallText();
  return (type, source) => ({
    ...cardStrings(t, type, source),
    notInPlaybookShort: ct("card.notInPlaybookShort"),
  });
}

type Props = {
  cards: readonly CardView[];
  wide: boolean;
  listening: boolean;
  /** The customer is mid-sentence (a partial transcript is showing). */
  speaking?: boolean;
  /** A practice call (D-073): its cards are never rated, so nothing reaches learning. */
  practice?: boolean;
};

/**
 * The newest card large on top, older ones compact below (DESIGN.md §5). The hero slot keeps a
 * minimum height, so the first card replaces the placeholder without moving anything below it.
 */
export function CardStack({ cards, wide, listening, speaking = false, practice = false }: Props) {
  const { t, locale } = useI18n();
  const ct = useCallText();
  const strings = useCardStrings();
  const hero = cards[0];
  const earlier = earlierCards(cards);
  // One older card open at a time (T-050 density rule); the rest stay at two lines.
  const [openId, setOpenId] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [whyOpenId, setWhyOpenId] = useState<string | null>(null);
  const heroParts = hero ? splitCardWhy(hero.text) : null;
  const heroWhyOpen = Boolean(hero && whyOpenId === hero.id);
  useAnnounceWhenDone(hero);
  const writing = Boolean(hero && !hero.done);
  const shown = all ? earlier : earlier.slice(0, EARLIER_LIMIT);
  const more = earlier.length - EARLIER_LIMIT;
  return (
    <View style={styles.stack}>
      {listening && hero ? <Activity speaking={speaking} writing={writing} /> : null}
      {hero && heroParts ? (
        <View style={styles.heroWrap}>
          <SuggestionCard
            key={hero.id}
            testID="hero-card"
            type={hero.type}
            source={hero.source}
            label={hero.label}
            text={heroParts.main}
            done={hero.done}
            wide={wide}
            strings={strings(hero.type, hero.source)}
          />
          {heroParts.why ? (
            <WhyInsight
              cardId={hero.id}
              why={heroParts.why}
              open={heroWhyOpen}
              onToggle={() => setWhyOpenId((id) => (id === hero.id ? null : hero.id))}
            />
          ) : null}
        </View>
      ) : listening ? (
        <Listening speaking={speaking} />
      ) : null}
      {/* UX-02: no rating under the live hero; after the call every AI card is rateable. */}
      {hero && !listening && !practice ? <RatingControls card={hero} /> : null}
      {earlier.length > 0 ? (
        <View style={styles.earlier}>
          <Text variant="label" weight="medium" tone="muted" accessibilityRole="header">
            {t("card.earlier")}
          </Text>
          {shown.map((c) => (
            <Earlier
              key={c.id}
              card={c}
              open={openId === c.id}
              label={t(openId === c.id ? "card.collapse" : "card.expand")}
              onToggle={() => setOpenId((id) => (id === c.id ? null : c.id))}
              alwaysRate={!listening}
              noRating={practice}
            >
              {(quiet) => (
                <SuggestionCard
                  variant="compact"
                  quiet={quiet}
                  type={c.type}
                  source={c.source}
                  label={c.label}
                  text={splitCardWhy(c.text).main}
                  done={c.done}
                  expanded={openId === c.id}
                  strings={strings(c.type, c.source)}
                  testID={`earlier-${c.id}-card`}
                />
              )}
            </Earlier>
          ))}
          {more > 0 ? (
            <View style={styles.more}>
              <Button
                variant="ghost"
                testID="show-earlier"
                label={
                  all
                    ? ct("card.showFewer")
                    : ct("card.showEarlier", { count: formatNumber(more, locale) })
                }
                onPress={() => setAll((v) => !v)}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Older cards step back so the newest stands out; hovering or focusing one brings it to full
 * strength (owner, 22 Oct). The step back is a colour change to the muted text token, not
 * opacity, so the sentence keeps WCAG AA contrast (T-050). Pressing one opens its whole
 * sentence; an open card stays at full strength. During the call its rating buttons appear only
 * while it is lit or open (UX-02); after the call they always show.
 */
function Earlier({
  card,
  children,
  open,
  label,
  onToggle,
  alwaysRate,
  noRating,
}: {
  card: CardView;
  children: (quiet: boolean) => ReactNode;
  open: boolean;
  label: string;
  onToggle: () => void;
  alwaysRate: boolean;
  noRating: boolean;
}) {
  const [lit, setLit] = useState(false);
  const canRate = useCanRate(card);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enter = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setLit(true);
  };
  const leave = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLit(false), UNLIT_DELAY_MS);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const rate = !noRating && canRate && (alwaysRate || lit || open);
  return (
    <Pressable
      // Hover area only (card + its rating row): not a control, not a tab stop.
      accessible={false}
      focusable={false}
      onHoverIn={enter}
      onHoverOut={leave}
      style={styles.earlierItem}
    >
      <Pressable
        testID={`earlier-${card.id}`}
        accessibilityRole="button"
        accessibilityHint={label}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={onToggle}
        onHoverIn={enter}
        onFocus={enter}
        onBlur={leave}
      >
        {children(!(lit || open))}
      </Pressable>
      {rate ? <RatingControls card={card} onFocus={enter} onBlur={leave} /> : null}
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
      <LiveDot />
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

/** UX-43a: a small live dot beside the listening line; the mascot is for review moods (R8). */
function LiveDot() {
  const { color } = useTheme();
  return (
    <View
      testID="live-dot"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.dot, { backgroundColor: color.signal }]}
    />
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
        <LiveDot />
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


function WhyInsight({
  cardId,
  why,
  open,
  onToggle,
}: {
  cardId: string;
  why: string;
  open: boolean;
  onToggle: () => void;
}) {
  const { locale } = useI18n();
  const { color } = useTheme();
  const copy = WHY_COPY[locale];
  return (
    <View style={styles.whyWrap}>
      <Pressable
        testID={`hero-why-toggle-${cardId}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={onToggle}
        style={styles.whyToggle}
      >
        <Text variant="label" weight="medium" tone="muted">
          {open ? copy.hide : copy.show}
        </Text>
      </Pressable>
      {open ? (
        <View
          testID={`hero-why-body-${cardId}`}
          style={[styles.whyBox, { backgroundColor: color.surfaceSunken, borderColor: color.border }]}
        >
          <Text variant="label" tone="muted">
            {why}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  heroWrap: { gap: space.xs },
  whyWrap: { gap: space.xs },
  whyToggle: { alignSelf: "flex-start", paddingVertical: space.xs },
  whyBox: { padding: space.sm, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  stack: { gap: space.xl },
  activity: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: -space.md },
  earlier: { gap: space.sm },
  earlierItem: { gap: space.xs },
  more: { alignItems: "flex-start" },
  dot: { width: size.dot, height: size.dot, borderRadius: radius.pill, alignSelf: "center" },
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
