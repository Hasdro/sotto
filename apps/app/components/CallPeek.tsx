/**
 * The quick look on a History row (owner, 22 Oct: "when I'm hovering over the calls, I want
 * some of their data to be as a small pop-up"). A compact card with the facts that do not fit
 * on the row: company, the review's chance to close, notes and the first suggestion. Shown by
 * the row on hover or keyboard focus; pointer events stay inside the row, so it does not flicker.
 */
import { Badge, Icon, type IconName, radius, space, Text, useTheme } from "@sotto/ui";
import { StyleSheet, View } from "react-native";
import type { PastCall } from "../features/history/mock";
import { OUTCOME_TONE } from "../features/history/outcome";
import { SOURCE_META } from "../lib/callSource";
import { formatDate, formatTime } from "../lib/format";
import { useI18n } from "../lib/locale";

export function CallPeek({ call }: { call: PastCall }) {
  const { t, locale } = useI18n();
  const { color, card } = useTheme();
  const meta = SOURCE_META[call.source ?? "computer"];
  const cards = call.cardCount ?? call.cards.length;
  const tone =
    call.success === undefined
      ? null
      : call.success >= 70
        ? card.answer.accent
        : call.success >= 40
          ? card.objection.accent
          : card.warning.accent;
  const said = call.cards[0];
  return (
    <View
      testID={`call-peek-${call.id}`}
      // The row already says all of this to a screen reader; this is a visual quick look.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.card,
        { backgroundColor: color.surface, borderColor: color.border, shadowColor: color.text },
      ]}
    >
      <View style={styles.head}>
        <View style={styles.grow}>
          <Text variant="body" weight="semibold" numberOfLines={1}>
            {call.customer}
          </Text>
          {call.company ? (
            <Text variant="label" tone="muted" numberOfLines={1}>
              {call.company}
            </Text>
          ) : null}
        </View>
        <Badge tone={OUTCOME_TONE[call.outcome]} label={t(`history.outcome.${call.outcome}`)} />
      </View>

      <View style={styles.facts}>
        <Fact icon="calendar" text={formatDate(call.startedAt, locale)} />
        <Fact icon="clock" text={formatTime(call.startedAt, locale)} />
        <Fact icon="timer" text={t("history.minutes", { count: call.minutes })} />
        <Fact icon="cards" text={String(cards)} />
        <Fact icon={meta.icon} text={meta.name} />
      </View>

      {tone && call.success !== undefined ? (
        <View style={styles.chance}>
          <View style={[styles.track, { backgroundColor: color.surfaceSunken }]}>
            <View style={[styles.fill, { width: `${call.success}%`, backgroundColor: tone }]} />
          </View>
          <Text variant="label" weight="semibold" color={tone}>
            {`${call.success}%`}
          </Text>
        </View>
      ) : null}

      {said ? (
        <View style={styles.said}>
          <Icon
            name={
              said.source === "playbook" ? "playbook" : said.source === "ai" ? "spark" : "timer"
            }
            size={14}
            color={color.textMuted}
          />
          <Text variant="label" tone="muted" numberOfLines={2} style={styles.grow}>
            {said.text}
          </Text>
        </View>
      ) : null}

      {call.notes ? (
        <Text variant="label" tone="muted" numberOfLines={2}>
          {`${t("history.detail.notes")}: ${call.notes}`}
        </Text>
      ) : null}
    </View>
  );
}

function Fact({ icon, text }: { icon: IconName; text: string }) {
  const { color } = useTheme();
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={14} color={color.textMuted} />
      <Text variant="label" tone="muted">
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 330,
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  grow: { flex: 1, minWidth: 0 },
  facts: { flexDirection: "row", flexWrap: "wrap", columnGap: space.md, rowGap: 4 },
  fact: { flexDirection: "row", alignItems: "center", gap: 4 },
  chance: { flexDirection: "row", alignItems: "center", gap: space.xs },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
  said: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.xs,
    paddingTop: space.xs,
  },
});
