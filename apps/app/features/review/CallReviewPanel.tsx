/**
 * The after-call review (owner, 21 Oct; UX-27): one line first — the mascot's mood, the coach's
 * tip and the chance to close as Likely / Unclear / Unlikely — then deal-risk signals labelled
 * AI-estimated (INT-07), and everything else (scores, talk time, mood, strengths) under Details.
 * No emoji: colour and shape.
 */
import type { CallReview, ReviewDimension } from "@sotto/engine";
import { chanceBand, REVIEW_DIMENSIONS } from "@sotto/engine";
import { Disclosure, type Hex, Mascot, moodFor, radius, space, Text, useTheme } from "@sotto/ui";
import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { deviceCall, useReview } from "../../lib/deviceHistory";
import { useI18n } from "../../lib/locale";
import { TalkMeter } from "../call/components/TalkMeter";
import { useReviewText } from "./strings";

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
      <View style={styles.row}>
        <Mascot mood="noResult" size={44} label={t("review.mood.noResult")} />
        <Text variant="label" tone="muted" style={styles.flex}>
          {t("review.none")}
        </Text>
      </View>,
    );
  }
  return shell(<Review review={state.review} callId={callId} />);
}

function Review({ review, callId }: { review: CallReview; callId: string | null }) {
  const { t } = useI18n();
  const rt = useReviewText();
  const { card, color } = useTheme();
  const tone = (v: number): Hex =>
    v >= 7 ? card.answer.accent : v >= 4 ? card.objection.accent : card.warning.accent;
  const resultMood = moodFor(review.success, review.sentiment);
  const band = chanceBand(review.success);
  const bandTone = { high: card.answer, medium: card.holding, low: card.warning }[band];
  const mood = {
    positive: card.answer,
    neutral: card.holding,
    negative: card.warning,
  }[review.sentiment];
  const lines = (callId ? (deviceCall(callId)?.transcript ?? []) : []).flatMap((e, i) =>
    e.kind === "line" ? [{ id: i, speaker: e.speaker, text: e.text, atMs: e.at_ms }] : [],
  );
  const risks = review.risks ?? [];
  return (
    <View style={styles.body}>
      {/* UX-27: the one line first — the mascot's mood, the coach's tip, the chance band. */}
      <View style={styles.row} testID="review-line">
        <Mascot
          mood={resultMood}
          sentiment={review.sentiment}
          size={44}
          label={t(`review.mood.${resultMood}`)}
        />
        <View style={styles.flex} testID="review-tip">
          <Text variant="label" weight="semibold" tone="muted">
            {t("review.tip")}
          </Text>
          <Text weight="semibold" accessibilityRole="header">
            {review.tip}
          </Text>
        </View>
        <View
          style={[styles.chip, { backgroundColor: bandTone.fill }]}
          testID="review-chance"
          accessible
          accessibilityLabel={rt("rv.chance.a11y", {
            band: rt(`rv.chance.${band}`),
            n: review.success,
          })}
        >
          <View style={[styles.dot, { backgroundColor: bandTone.accent }]} />
          <Text variant="label" weight="medium" color={bandTone.text}>
            {rt(`rv.chance.${band}`)}
          </Text>
        </View>
      </View>

      {risks.length > 0 ? (
        <View style={styles.gap} testID="review-risks">
          <View style={styles.row}>
            <Text variant="label" weight="semibold">
              {rt("rv.risks")}
            </Text>
            <View style={[styles.tag, { borderColor: color.border }]}>
              <Text variant="label" tone="muted">
                {rt("rv.aiEstimated")}
              </Text>
            </View>
          </View>
          {risks.map((r) => (
            <View key={r.reason} style={styles.point}>
              <View style={[styles.dot, { backgroundColor: card.warning.accent }]} />
              <Text variant="label" style={styles.flex}>
                {r.quote ? `${r.reason} · “${r.quote}”` : r.reason}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <Disclosure
        title={rt("rv.details")}
        summary={rt("rv.detailsSummary")}
        testID="review-details"
      >
        <View style={styles.body}>
          {review.summary ? (
            <View style={styles.gap}>
              <Text variant="label" weight="semibold" tone="muted">
                {rt("rv.summary")}
              </Text>
              <Text variant="label">{review.summary}</Text>
            </View>
          ) : null}
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
          {lines.length > 0 ? (
            <View style={styles.gap} testID="review-talk">
              <Text variant="label" weight="semibold" tone="muted">
                {rt("rv.talk")}
              </Text>
              <TalkMeter lines={lines} />
            </View>
          ) : null}
          <View style={[styles.chip, styles.self, { backgroundColor: mood.fill }]}>
            <View style={[styles.dot, { backgroundColor: mood.accent }]} />
            <Text variant="label" weight="medium" color={mood.text}>
              {t(`review.mood.${review.sentiment}`)}
            </Text>
          </View>
          <View style={styles.lists}>
            <Points
              title={t("review.strengths")}
              items={review.strengths}
              dot={card.answer.accent}
            />
            <Points
              title={t("review.improve")}
              items={review.improve}
              dot={card.objection.accent}
            />
          </View>
          <Text variant="label" tone="muted" style={{ color: color.textMuted }}>
            {t("review.disclaimer")}
          </Text>
        </View>
      </Disclosure>
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
  self: { alignSelf: "flex-start" },
  tag: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
  },
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
