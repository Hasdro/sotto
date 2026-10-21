/**
 * The after-call review (owner, 21 Oct): chance to close, six skill scores as sliders, the
 * customer's mood, one coaching tip, strengths and what to improve. No emoji: colour and shape.
 */
import type { CallReview, ReviewDimension } from "@sotto/engine";
import { REVIEW_DIMENSIONS } from "@sotto/engine";
import { type Hex, Mascot, radius, space, Text, useTheme } from "@sotto/ui";
import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { useReview } from "../../lib/deviceHistory";
import { useI18n } from "../../lib/locale";

export function CallReviewPanel({ callId }: { callId: string | null }) {
  const { t } = useI18n();
  const { color } = useTheme();
  const state = useReview(callId);
  const shell = (children: React.ReactNode) => (
    <View
      testID={`review-${state.status}`}
      style={[styles.panel, { backgroundColor: color.surface, borderColor: color.border }]}
    >
      {children}
    </View>
  );
  if (state.status === "pending") {
    return shell(
      <View style={styles.row}>
        <Mascot state="reviewing" size={44} />
        <View style={styles.flex}>
          <Text weight="semibold">{t("review.pending.title")}</Text>
          <Text variant="label" tone="muted">
            {t("review.pending.body")}
          </Text>
        </View>
      </View>,
    );
  }
  if (state.status === "none") {
    return shell(
      <Text variant="label" tone="muted">
        {t("review.none")}
      </Text>,
    );
  }
  return shell(<Review review={state.review} />);
}

function Review({ review }: { review: CallReview }) {
  const { t } = useI18n();
  const { card, color } = useTheme();
  const tone = (v: number): Hex =>
    v >= 7 ? card.answer.accent : v >= 4 ? card.objection.accent : card.warning.accent;
  const mood = {
    positive: card.answer,
    neutral: card.holding,
    negative: card.warning,
  }[review.sentiment];
  return (
    <View style={styles.body}>
      <View style={styles.row}>
        <Mascot state="suggesting" size={44} />
        <View style={styles.flex}>
          <Text variant="heading" weight="semibold" accessibilityRole="header">
            {t("review.title")}
          </Text>
          {review.summary ? (
            <Text variant="label" tone="muted">
              {review.summary}
            </Text>
          ) : null}
        </View>
        <View style={[styles.chip, { backgroundColor: mood.fill }]}>
          <View style={[styles.dot, { backgroundColor: mood.accent }]} />
          <Text variant="label" weight="medium" color={mood.text}>
            {t(`review.mood.${review.sentiment}`)}
          </Text>
        </View>
      </View>

      <View style={styles.gap}>
        <View style={styles.between}>
          <Text weight="semibold">{t("review.success")}</Text>
          <Text
            variant="heading"
            weight="semibold"
            color={tone(review.success / 10)}
            style={styles.num}
          >
            {`${review.success}%`}
          </Text>
        </View>
        <Slider
          value={review.success / 100}
          fill={tone(review.success / 10)}
          big
          testID="review-success"
        />
      </View>

      <View style={styles.grid}>
        {REVIEW_DIMENSIONS.map((d: ReviewDimension) => (
          <View key={d} style={styles.cell}>
            <View style={styles.between}>
              <Text variant="label" weight="medium">
                {t(`review.dim.${d}`)}
              </Text>
              <Text variant="label" weight="semibold" style={styles.num}>
                {`${review.scores[d]}/10`}
              </Text>
            </View>
            <Slider value={review.scores[d] / 10} fill={tone(review.scores[d])} />
          </View>
        ))}
      </View>

      <View testID="review-tip" style={[styles.tip, { backgroundColor: card.signal.fill }]}>
        <Text variant="label" weight="semibold" color={card.signal.muted}>
          {t("review.tip")}
        </Text>
        <Text weight="medium" color={card.signal.text}>
          {review.tip}
        </Text>
      </View>

      <View style={styles.lists}>
        <Points title={t("review.strengths")} items={review.strengths} dot={card.answer.accent} />
        <Points title={t("review.improve")} items={review.improve} dot={card.objection.accent} />
      </View>
      <Text variant="label" tone="muted" style={{ color: color.textMuted }}>
        {t("review.disclaimer")}
      </Text>
    </View>
  );
}

function Points({ title, items, dot }: { title: string; items: string[]; dot: Hex }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.points}>
      <Text variant="label" weight="semibold" tone="muted">
        {title}
      </Text>
      {items.map((p) => (
        <View key={p} style={styles.point}>
          <View style={[styles.dot, { backgroundColor: dot }]} />
          <Text variant="label" style={styles.flex}>
            {p}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** A read-only slider: a track, a fill that grows in, and a knob at the value. */
function Slider({
  value,
  fill,
  big = false,
  testID,
}: {
  value: number;
  fill: Hex;
  big?: boolean;
  testID?: string;
}) {
  const { color } = useTheme();
  const grow = useRef(new Animated.Value(0)).current;
  const v = Math.min(1, Math.max(0, value));
  useEffect(() => {
    Animated.timing(grow, {
      toValue: v,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [grow, v]);
  const h = big ? 10 : 6;
  const knob = big ? 18 : 12;
  const width = grow.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
      style={[styles.track, { height: knob, justifyContent: "center" }]}
    >
      <View
        style={[
          styles.rail,
          { height: h, borderRadius: h / 2, backgroundColor: color.surfaceSunken },
        ]}
      >
        <Animated.View style={{ width, height: h, borderRadius: h / 2, backgroundColor: fill }} />
      </View>
      <Animated.View
        style={[
          styles.knob,
          {
            width: knob,
            height: knob,
            borderRadius: knob / 2,
            borderColor: fill,
            backgroundColor: color.surface,
            left: grow.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
            marginLeft: -knob / 2,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space.md,
  },
  body: { gap: space.lg },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" },
  flex: { flex: 1, minWidth: 0 },
  between: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: space.sm,
  },
  gap: { gap: space.sm },
  num: { fontVariant: ["tabular-nums"] },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  cell: { flexGrow: 1, flexBasis: 220, gap: space.xs },
  track: { position: "relative" },
  rail: { overflow: "hidden" },
  knob: { position: "absolute", borderWidth: 3 },
  tip: { padding: space.lg, borderRadius: radius.md, gap: space.xs },
  lists: { flexDirection: "row", flexWrap: "wrap", gap: space.xl },
  points: { flexGrow: 1, flexBasis: 220, gap: space.xs },
  point: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
