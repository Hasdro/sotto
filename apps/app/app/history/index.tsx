/** Call history (R3: own history on every device). Sample calls only in the local demo (T-024). */
import { Badge, EmptyState, layout, Panel, radius, Screen, space, Text, useTheme } from "@sotto/ui";
import { Link } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { PageHeader } from "../../components/PageHeader";
import { PAST_CALLS, type PastCall } from "../../features/history/mock";
import { OUTCOME_TONE } from "../../features/history/outcome";
import { useServerCalls } from "../../features/history/server";
import { SOURCE_META } from "../../lib/callSource";
import { sampleDataAllowed } from "../../lib/cloud";
import { formatDate, formatTime } from "../../lib/format";
import { useI18n } from "../../lib/locale";

export default function HistoryScreen() {
  const { t } = useI18n();
  const mine = useServerCalls();
  if (!sampleDataAllowed()) {
    return (
      <Screen scroll maxWidth={layout.readableMaxWidth + 160} testID="history" style={styles.page}>
        <PageHeader icon="🕘" title={t("history.title")} subtitle={t("history.subtitle")} />
        {mine && mine.length > 0 ? (
          <CallList calls={mine} />
        ) : (
          <EmptyState title={t("history.none.title")} body={t("history.none.body")} />
        )}
      </Screen>
    );
  }
  return (
    <Screen scroll maxWidth={layout.readableMaxWidth + 160} testID="history" style={styles.page}>
      <PageHeader icon="🕘" title={t("history.title")} subtitle={t("history.subtitle")} />
      {mine && mine.length > 0 ? (
        <>
          <Text variant="label" weight="medium" tone="muted" accessibilityRole="header">
            {t("history.yours")}
          </Text>
          <CallList calls={mine} />
          <Text variant="label" weight="medium" tone="muted" accessibilityRole="header">
            {t("history.samples")}
          </Text>
        </>
      ) : null}
      <CallList calls={PAST_CALLS} />
    </Screen>
  );
}

function CallList({ calls }: { calls: readonly PastCall[] }) {
  const { t, locale } = useI18n();
  const { color, card } = useTheme();
  return (
    <Panel padded={false}>
      {calls.map((call, i) => {
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
        return (
          <Link key={call.id} href={`/history/${call.id}`} asChild>
            <Pressable
              accessibilityRole="link"
              testID={`history-row-${call.id}`}
              style={(state) =>
                StyleSheet.flatten([
                  styles.row,
                  i > 0 ? { borderTopColor: color.border, borderTopWidth: 1 } : null,
                  (state as { hovered?: boolean }).hovered
                    ? { backgroundColor: color.surfaceSunken }
                    : null,
                ])
              }
            >
              <View
                style={[styles.icon, { backgroundColor: color.surfaceSunken }]}
                accessibilityLabel={meta.name}
              >
                <Text variant="heading">{meta.icon}</Text>
              </View>
              <View style={styles.main}>
                <Text variant="body" weight="semibold" numberOfLines={1}>
                  {call.customer}
                </Text>
                <View style={styles.facts}>
                  {call.company ? (
                    <Text variant="label" tone="muted">{`🏢 ${call.company}`}</Text>
                  ) : null}
                  <Text
                    variant="label"
                    tone="muted"
                  >{`📅 ${formatDate(call.startedAt, locale)}`}</Text>
                  <Text
                    variant="label"
                    tone="muted"
                  >{`🕒 ${formatTime(call.startedAt, locale)}`}</Text>
                  <Text variant="label" tone="muted">
                    {`⏳ ${t("history.minutes", { count: call.minutes })}`}
                  </Text>
                  <Text variant="label" tone="muted">{`🃏 ${cards}`}</Text>
                  <Text variant="label" tone="muted">{`${meta.icon} ${meta.name}`}</Text>
                </View>
              </View>
              <View style={styles.meta}>
                <Badge
                  tone={OUTCOME_TONE[call.outcome]}
                  label={t(`history.outcome.${call.outcome}`)}
                />
                {tone && call.success !== undefined ? (
                  <View
                    style={styles.chance}
                    accessibilityLabel={t("history.chance", { n: call.success })}
                  >
                    <View style={[styles.track, { backgroundColor: color.surfaceSunken }]}>
                      <View
                        style={[styles.fill, { width: `${call.success}%`, backgroundColor: tone }]}
                      />
                    </View>
                    <Text variant="label" weight="semibold" color={tone}>
                      {`${call.success}%`}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          </Link>
        );
      })}
    </Panel>
  );
}

const styles = StyleSheet.create({
  page: { paddingTop: space.xl, gap: space.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 64,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  main: { flex: 1, minWidth: 0, gap: 4 },
  facts: { flexDirection: "row", flexWrap: "wrap", columnGap: space.md, rowGap: 2 },
  meta: { alignItems: "flex-end", gap: space.xs },
  chance: { flexDirection: "row", alignItems: "center", gap: space.xs },
  track: { width: 64, height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
});
