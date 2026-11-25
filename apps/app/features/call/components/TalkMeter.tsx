/**
 * Talk-time meter (UX-18 + C8):
 * - During a call with separate tracks (`agentMs` / `customerMs` and `approximate=false`),
 *   shows the compact agent talk-share bar (hidden in approximate/single-mic mode, C8).
 * - Also preserves `{ lines, variant }` (`UX-18`, `talkShare`, `AGENT_TOO_MUCH`) for
 *   TranscriptPane and CallReviewPanel so existing callers/tests keep working cleanly.
 */
import { Icon, radius, space, Text, useTheme } from "@sotto/ui";
import { StyleSheet, View } from "react-native";
import { useFeature } from "../../../components/FeatureGate";
import { useI18n } from "../../../lib/locale";
import type { TranscriptEntry } from "../session";

/** Above this share of words or talk time, the agent is talking too much. */
export const AGENT_TOO_MUCH = 65;

const COPY = {
  en: { label: "Your talk time" },
  ar: { label: "نسبة حديثك" },
} as const;

export function talkShare(
  lines: readonly TranscriptEntry[],
): { customer: number; agent: number } | null {
  let c = 0;
  let a = 0;
  for (const l of lines) {
    const words = l.text.trim() ? l.text.trim().split(/\s+/).length : 0;
    if (l.speaker === "customer") c += words;
    else if (l.speaker === "agent") a += words;
  }
  if (c + a === 0 || c === 0 || a === 0) return null;
  const customer = Math.round((c / (c + a)) * 100);
  return { customer, agent: 100 - customer };
}

export function agentTalkShare(agentMs: number, customerMs: number): number | null {
  const a = Math.max(0, agentMs);
  const c = Math.max(0, customerMs);
  const total = a + c;
  if (total <= 0) return null;
  return Math.round((a / total) * 100);
}

export type TalkMeterProps =
  | {
      agentMs: number;
      customerMs: number;
      /** True when running on a single mic / approximate voice-sample mode (C8: must hide). */
      approximate: boolean;
      lines?: undefined;
      variant?: undefined;
    }
  | {
      lines: readonly TranscriptEntry[];
      variant?: "alert" | "full";
      agentMs?: undefined;
      customerMs?: undefined;
      approximate?: undefined;
    };

export function TalkMeter(props: TalkMeterProps) {
  const { t, locale } = useI18n();
  const { speaker, color } = useTheme();
  const gate = useFeature("talk_meter");

  if (props.lines !== undefined) {
    const variant = props.variant ?? "alert";
    if (variant === "alert" && gate.state !== "available") return null;
    const share = talkShare(props.lines);
    if (!share) return null;
    const tooMuch = share.agent > AGENT_TOO_MUCH;
    if (variant === "alert" && !tooMuch) return null;
    return (
      <View style={styles.wrap} testID="talk-meter" accessibilityLabel={t("call.talk.a11y", share)}>
        <View style={[styles.bar, { backgroundColor: color.surfaceSunken }]}>
          <View style={{ width: `${share.customer}%`, backgroundColor: speaker.customer.label }} />
          <View style={{ width: 2, backgroundColor: color.surface }} />
          <View style={{ flex: 1, backgroundColor: speaker.agent.label }} />
        </View>
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <Icon name="mic" size={13} color={speaker.customer.label} />
            <Text variant="label" color={speaker.customer.label}>
              {`${t("call.speaker.customer")} ${share.customer}%`}
            </Text>
          </View>
          <View style={styles.legendItem}>
            <Icon name="headphones" size={13} color={speaker.agent.label} />
            <Text variant="label" color={speaker.agent.label}>
              {`${t("call.speaker.agent")} ${share.agent}%`}
            </Text>
          </View>
        </View>
        {tooMuch ? (
          <Text variant="label" tone="notice" testID="talk-too-much">
            {t("call.talk.tooMuch")}
          </Text>
        ) : null}
      </View>
    );
  }

  if (gate.state !== "available" || props.approximate) return null;
  const pct = agentTalkShare(props.agentMs, props.customerMs);
  if (pct === null) return null;

  const label = COPY[locale].label;
  const barColor = pct > AGENT_TOO_MUCH ? color.noticeBorder : color.primary;

  return (
    <View
      testID="talk-meter"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${label}: ${pct}%`}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={styles.wrap}
    >
      <View style={styles.head}>
        <Text variant="label" tone="muted">
          {label}
        </Text>
        <Text variant="label" weight="medium" testID="talk-meter-pct">
          {pct}%
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: color.surfaceSunken }]}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs, marginBottom: space.sm },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  track: { height: 6, borderRadius: radius.pill, overflow: "hidden" },
  fill: { height: 6, borderRadius: radius.pill },
  bar: { flexDirection: "row", height: 8, borderRadius: radius.pill, overflow: "hidden" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legend: { flexDirection: "row", justifyContent: "space-between" },
});
