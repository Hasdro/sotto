/** Call history (R3: own history on every device). Sample calls only in the local demo (T-024). */

import {
  Badge,
  EmptyState,
  Icon,
  type IconName,
  layout,
  Panel,
  radius,
  Screen,
  space,
  Text,
  TextField,
  useTheme,
} from "@sotto/ui";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { AppLink } from "../../components/AppLink";
import { CallPeek } from "../../components/CallPeek";
import { PageHeader } from "../../components/PageHeader";
import { PAST_CALLS, type PastCall } from "../../features/history/mock";
import { OUTCOME_TONE } from "../../features/history/outcome";
import { useServerCalls } from "../../features/history/server";
import { searchCalls } from "../../features/reports/objections";
import { SOURCE_META } from "../../lib/callSource";
import { sampleDataAllowed } from "../../lib/cloud";
import { allDeviceCalls } from "../../lib/deviceHistory";
import { formatDate, formatTime } from "../../lib/format";
import { useI18n } from "../../lib/locale";

export default function HistoryScreen() {
  const { t } = useI18n();
  const mine = useServerCalls();
  const [query, setQuery] = useState("");
  const hits = useMemo(() => searchCalls(allDeviceCalls(), query), [query]);
  const found = query.trim() ? (mine ?? []).filter((c) => hits.has(c.id)) : mine;
  if (!sampleDataAllowed()) {
    return (
      <Screen scroll maxWidth={layout.readableMaxWidth + 160} testID="history" style={styles.page}>
        <PageHeader icon="history" title={t("history.title")} subtitle={t("history.subtitle")} />
        {mine && mine.length > 0 ? (
          <TextField
            accessibilityLabel={t("history.search")}
            placeholder={t("history.search")}
            value={query}
            onChangeText={setQuery}
            testID="history-search"
          />
        ) : null}
        {query.trim() && found && found.length === 0 ? (
          <Text tone="muted">{t("history.search.none", { q: query.trim() })}</Text>
        ) : null}
        {found && found.length > 0 ? (
          <>
            <Text variant="label" weight="medium" tone="muted" accessibilityRole="header">
              {t("history.yours")}
            </Text>
            <CallList calls={found} snippets={query.trim() ? hits : undefined} />
          </>
        ) : null}
        {!mine || mine.length === 0 ? (
          <EmptyState
            title={t("history.none.title")}
            body={t("history.none.body")}
            action={{
              label: t("history.none.sample"),
              onPress: () => router.push(`/history/${PAST_CALLS[0]?.id ?? "c-1042"}`),
            }}
          />
        ) : null}
      </Screen>
    );
  }
  return (
    <Screen scroll maxWidth={layout.readableMaxWidth + 160} testID="history" style={styles.page}>
      <PageHeader icon="history" title={t("history.title")} subtitle={t("history.subtitle")} />
      {mine && mine.length > 0 ? (
        <>
          <Text variant="label" weight="medium" tone="muted" accessibilityRole="header">
            {t("history.yours")}
          </Text>
          <CallList calls={mine} />
        </>
      ) : (
        <>
          <Text variant="label" weight="medium" tone="muted" accessibilityRole="header">
            {t("history.samples")}
          </Text>
          <CallList calls={PAST_CALLS} />
        </>
      )}
    </Screen>
  );
}

function CallList({
  calls,
  snippets,
}: {
  calls: readonly PastCall[];
  snippets?: ReadonlyMap<string, string> | undefined;
}) {
  const { t, locale } = useI18n();
  const { color, card } = useTheme();
  const [peek, setPeek] = useState<{ id: string; above: boolean } | null>(null);
  const canHover = Platform.OS === "web";
  return (
    <Panel padded={false} style={styles.list}>
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
          <AppLink
            key={call.id}
            href={`/history/${call.id}`}
            accessibilityRole="link"
            testID={`history-row-${call.id}`}
            {...(canHover
              ? {
                  onHoverIn: () => setPeek({ id: call.id, above: i >= calls.length - 2 }),
                  onHoverOut: () => setPeek((p) => (p?.id === call.id ? null : p)),
                  onFocus: () => setPeek({ id: call.id, above: i >= calls.length - 2 }),
                  onBlur: () => setPeek((p) => (p?.id === call.id ? null : p)),
                }
              : {})}
            style={(state) =>
              StyleSheet.flatten([
                styles.row,
                i > 0 ? { borderTopColor: color.border, borderTopWidth: 1 } : null,
                (state as { hovered?: boolean }).hovered || peek?.id === call.id
                  ? { backgroundColor: color.surfaceSunken }
                  : null,
                peek?.id === call.id ? { zIndex: 30 } : null,
              ])
            }
          >
            <View
              style={[styles.icon, { backgroundColor: color.surfaceSunken }]}
              accessibilityLabel={meta.name}
            >
              <Icon name={meta.icon} size={22} color={color.textMuted} />
            </View>
            <View style={styles.main}>
              <Text variant="body" weight="semibold" numberOfLines={1}>
                {call.customer}
              </Text>
              <View style={styles.facts}>
                {call.company ? <Fact icon="home" text={call.company} /> : null}
                <Fact icon="calendar" text={formatDate(call.startedAt, locale)} />
                <Fact icon="clock" text={formatTime(call.startedAt, locale)} />
                <Fact icon="timer" text={t("history.minutes", { count: call.minutes })} />
                <Fact icon="cards" text={String(cards)} />
                <Fact icon={meta.icon} text={meta.name} />
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
            {peek?.id === call.id ? (
              <View
                testID={`call-peek-wrap-${call.id}`}
                style={[styles.peek, peek.above ? styles.peekAbove : styles.peekBelow]}
              >
                <CallPeek call={call} />
              </View>
            ) : null}
          </AppLink>
        );
      })}
    </Panel>
  );
}

function Fact({ icon, text }: { icon: IconName; text: string }) {
  const { color } = useTheme();
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={14} color={color.textMuted} />
      <Text variant="label" tone="muted" numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { paddingTop: space.xl, gap: space.md },
  list: { overflow: "visible" },
  peek: { position: "absolute", end: 12, zIndex: 20, elevation: 10 },
  peekBelow: { top: "100%", marginTop: 6 },
  peekAbove: { bottom: "100%", marginBottom: 6 },
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
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  main: { flex: 1, minWidth: 0, gap: 4 },
  facts: { flexDirection: "row", flexWrap: "wrap", columnGap: space.md, rowGap: 2 },
  fact: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { alignItems: "flex-end", gap: space.xs },
  chance: { flexDirection: "row", alignItems: "center", gap: space.xs },
  track: { width: 64, height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
});
