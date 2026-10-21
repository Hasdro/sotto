/**
 * Talk-time meter (owner, 22 Oct): who has done the talking so far, by words spoken. A warning
 * when the agent talks much more than the customer (good calls let the customer talk).
 */
import { radius, space, Text, useTheme } from "@sotto/ui";
import { StyleSheet, View } from "react-native";
import { useI18n } from "../../../lib/locale";
import type { TranscriptEntry } from "../session";

/** Above this share of words, the agent is talking too much. */
export const AGENT_TOO_MUCH = 65;

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

export function TalkMeter({ lines }: { lines: readonly TranscriptEntry[] }) {
  const { t } = useI18n();
  const { speaker, color } = useTheme();
  const share = talkShare(lines);
  if (!share) return null;
  const tooMuch = share.agent > AGENT_TOO_MUCH;
  return (
    <View style={styles.wrap} testID="talk-meter" accessibilityLabel={t("call.talk.a11y", share)}>
      <View style={[styles.bar, { backgroundColor: color.surfaceSunken }]}>
        <View style={{ width: `${share.customer}%`, backgroundColor: speaker.customer.label }} />
        <View style={{ width: 2, backgroundColor: color.surface }} />
        <View style={{ flex: 1, backgroundColor: speaker.agent.label }} />
      </View>
      <View style={styles.legend}>
        <Text variant="label" color={speaker.customer.label}>
          {`🗣️ ${t("call.speaker.customer")} ${share.customer}%`}
        </Text>
        <Text variant="label" color={speaker.agent.label}>
          {`🎧 ${t("call.speaker.agent")} ${share.agent}%`}
        </Text>
      </View>
      {tooMuch ? (
        <Text variant="label" tone="notice" testID="talk-too-much">
          {t("call.talk.tooMuch")}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs, marginBottom: space.sm },
  bar: { flexDirection: "row", height: 8, borderRadius: radius.pill, overflow: "hidden" },
  legend: { flexDirection: "row", justifyContent: "space-between" },
});
