/**
 * The quick look on a History row (owner, 22 Oct: "when I'm hovering over the calls, I want
 * some of their data to be as a small pop-up"). A compact card with the facts that do not fit
 * on the row: company, the review's chance to close, notes and the first suggestion. Shown by
 * the row on hover or keyboard focus; pointer events stay inside the row, so it does not flicker.
 */
import {
  Badge,
  Icon,
  type IconName,
  radius,
  space,
  Text,
  useGlassStyle,
  useTheme,
} from "@sotto/ui";
import { StyleSheet, View } from "react-native";
import { ChanceMeter } from "../features/history/ChanceMeter";
import type { PastCall } from "../features/history/mock";
import { OUTCOME_TONE } from "../features/history/outcome";
import { callTitle } from "../features/history/title";
import { SOURCE_META, sourceName } from "../lib/callSource";
import { formatDate, formatTime } from "../lib/format";
import { countKey } from "../lib/i18n";
import { useI18n } from "../lib/locale";

export function CallPeek({ call }: { call: PastCall }) {
  const { t, locale } = useI18n();
  const { color } = useTheme();
  const glass = useGlassStyle({ elevated: true });
  const meta = SOURCE_META[call.source ?? "computer"];
  const cards = call.cardCount ?? call.cards.length;
  const said = call.cards[0];
  return (
    <View
      testID={`call-peek-${call.id}`}
      // The row already says all of this to a screen reader; this is a visual quick look.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.card, glass]}
    >
      <View style={styles.head}>
        <View style={styles.grow}>
          <Text variant="body" weight="semibold" numberOfLines={1}>
            {callTitle(call.customer, call.startedAt, t)}
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
        <Fact icon="cards" text={t(countKey("home.cardsN", cards), { n: cards })} />
        <Fact icon={meta.icon} text={sourceName(call.source ?? "computer", locale)} />
      </View>

      {call.success !== undefined ? <ChanceMeter success={call.success} /> : null}

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
    padding: space.lg,
    borderRadius: radius.xl,
  },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  grow: { flex: 1, minWidth: 0 },
  facts: { flexDirection: "row", flexWrap: "wrap", columnGap: space.md, rowGap: 4 },
  fact: { flexDirection: "row", alignItems: "center", gap: 4 },
  said: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.xs,
    paddingTop: space.xs,
  },
});
