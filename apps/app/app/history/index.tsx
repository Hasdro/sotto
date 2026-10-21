/** Call history (R3: own history on every device). Sample calls only in the local demo (T-024). */
import { Badge, EmptyState, layout, Panel, radius, Screen, space, Text, useTheme } from "@sotto/ui";
import { Link } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { PageHeader } from "../../components/PageHeader";
import { PAST_CALLS, type PastCall } from "../../features/history/mock";
import { OUTCOME_TONE } from "../../features/history/outcome";
import { useServerCalls } from "../../features/history/server";
import { sampleDataAllowed } from "../../lib/cloud";
import { formatDateTime } from "../../lib/format";
import { useI18n } from "../../lib/locale";

export default function HistoryScreen() {
  const { t } = useI18n();
  const mine = useServerCalls();
  if (!sampleDataAllowed()) {
    return (
      <Screen scroll maxWidth={layout.readableMaxWidth + 160} testID="history" style={styles.page}>
        <PageHeader title={t("history.title")} subtitle={t("history.subtitle")} />
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
      <PageHeader title={t("history.title")} subtitle={t("history.subtitle")} />
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
  const { color } = useTheme();
  return (
    <Panel padded={false}>
      {calls.map((call, i) => (
        <Link key={call.id} href={`/history/${call.id}`} asChild>
          <Pressable
            accessibilityRole="link"
            style={StyleSheet.flatten([
              styles.row,
              i > 0 ? { borderTopColor: color.border, borderTopWidth: 1 } : null,
            ])}
          >
            <View style={[styles.initial, { backgroundColor: color.surfaceSunken }]}>
              <Text variant="body" weight="semibold" tone="primary">
                {call.customer.slice(0, 1)}
              </Text>
            </View>
            <View style={styles.main}>
              <Text variant="body" weight="semibold" numberOfLines={1}>
                {call.customer}
              </Text>
              {call.company ? (
                <Text variant="label" tone="muted" numberOfLines={1}>
                  {call.company}
                </Text>
              ) : null}
            </View>
            <View style={styles.meta}>
              <Badge
                tone={OUTCOME_TONE[call.outcome]}
                label={t(`history.outcome.${call.outcome}`)}
              />
              <Text variant="label" tone="muted">
                {formatDateTime(call.startedAt, locale)}
              </Text>
              <Text variant="label" tone="muted">
                {t("history.minutes", { count: call.minutes })}
              </Text>
            </View>
          </Pressable>
        </Link>
      ))}
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
  initial: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  main: { flex: 1, minWidth: 0, gap: 2 },
  meta: { alignItems: "flex-end", gap: 2 },
});
