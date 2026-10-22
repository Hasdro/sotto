/** One past call: transcript and the cards shown (R1, R3). Mock data until Phase 5. */
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  layout,
  Panel,
  Screen,
  SuggestionCard,
  space,
  Text,
  TranscriptLine,
  useTheme,
} from "@sotto/ui";
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { SourceChip } from "../../components/SourceChip";
import { cardStrings, clock } from "../../features/call/components/strings";
import { findCall } from "../../features/history/mock";
import { OUTCOME_TONE } from "../../features/history/outcome";
import { RecordingPlayer } from "../../features/history/RecordingPlayer";
import { useServerCall } from "../../features/history/server";
import { CallReviewPanel } from "../../features/review/CallReviewPanel";
import { FollowUp } from "../../features/review/FollowUp";
import { formatDate, formatTime } from "../../lib/format";
import { useI18n } from "../../lib/locale";
import { useIsWide } from "../../lib/responsive";

export default function CallDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useI18n();
  const wide = useIsWide();
  const { color } = useTheme();
  const sample = findCall(String(id));
  const fromServer = useServerCall(String(id), sample !== undefined);
  const call = sample ?? (typeof fromServer === "string" ? undefined : fromServer);
  const back = (
    <Button
      variant="ghost"
      label={t("history.detail.back")}
      onPress={() => router.push("/history")}
    />
  );
  if (!call && fromServer === "loading") {
    return <Screen style={styles.center}>{null}</Screen>;
  }
  if (!call) {
    return (
      <Screen style={styles.center}>
        <EmptyState
          title={t("history.notFound")}
          action={{ label: t("history.detail.back"), onPress: () => router.push("/history") }}
        />
      </Screen>
    );
  }
  const transcript = (
    <Panel style={styles.col}>
      <Text variant="label" weight="medium" tone="muted" accessibilityRole="header">
        {t("history.detail.transcript")}
      </Text>
      {call.transcript.map((l) => (
        <TranscriptLine
          key={`${l.atMs}-${l.speaker}`}
          speaker={l.speaker}
          speakerLabel={t(`call.speaker.${l.speaker}`)}
          text={l.text}
          time={clock(l.atMs)}
        />
      ))}
    </Panel>
  );
  const cards = (
    <View style={styles.col}>
      <Text variant="label" weight="medium" tone="muted" accessibilityRole="header">
        {t("history.detail.cards")}
      </Text>
      {call.cards.map((c) => (
        <View key={`${c.atMs}-${c.type}`} style={styles.cardRow}>
          <Text variant="label" tone="muted" style={styles.time}>
            {clock(c.atMs)}
          </Text>
          <View style={styles.grow}>
            <SuggestionCard
              variant="compact"
              type={c.type}
              source={c.source}
              text={c.text}
              done
              strings={cardStrings(t, c.type, c.source)}
            />
          </View>
        </View>
      ))}
    </View>
  );
  return (
    <Screen scroll maxWidth={layout.contentMaxWidth} testID="history-detail" style={styles.page}>
      <View style={styles.backRow}>{back}</View>
      <View style={styles.head}>
        <Text variant="title" weight="semibold" accessibilityRole="header">
          {call.customer}
        </Text>
        <View style={styles.metaRow}>
          <Badge tone={OUTCOME_TONE[call.outcome]} label={t(`history.outcome.${call.outcome}`)} />
          {call.source ? <SourceChip source={call.source} /> : null}
          {call.company ? <Meta icon="home" text={call.company} color={color.textMuted} /> : null}
          <Meta icon="calendar" text={formatDate(call.startedAt, locale)} color={color.textMuted} />
          <Meta icon="clock" text={formatTime(call.startedAt, locale)} color={color.textMuted} />
          <Meta
            icon="timer"
            text={t("history.minutes", { count: call.minutes })}
            color={color.textMuted}
          />
        </View>
      </View>
      {sample ? null : (
        <View style={styles.review}>
          <CallReviewPanel callId={String(id)} />
          <FollowUp callId={String(id)} />
        </View>
      )}
      {sample ? null : <RecordingPlayer callId={String(id)} />}
      {call.notes ? (
        <Panel style={styles.notes} testID="call-detail-notes">
          <View style={styles.notesTitle}>
            <Icon name="note" size={15} color={color.textMuted} />
            <Text variant="label" weight="medium" tone="muted" accessibilityRole="header">
              {t("history.detail.notes")}
            </Text>
          </View>
          <Text>{call.notes}</Text>
        </Panel>
      ) : null}
      <View style={[styles.body, wide ? styles.bodyWide : null]}>
        {wide ? transcript : cards}
        {wide ? cards : transcript}
      </View>
    </Screen>
  );
}

function Meta({
  icon,
  text,
  color,
}: {
  icon: "home" | "calendar" | "clock" | "timer";
  text: string;
  color: string;
}) {
  return (
    <View style={styles.metaFact}>
      <Icon name={icon} size={15} color={color} />
      <Text variant="body" tone="muted">
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { paddingTop: space.lg },
  center: { justifyContent: "center" },
  backRow: { alignItems: "flex-start", marginStart: -space.lg },
  head: { gap: space.sm, marginBottom: space.xl },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.md },
  metaFact: { flexDirection: "row", alignItems: "center", gap: 4 },
  notesTitle: { flexDirection: "row", alignItems: "center", gap: 4 },
  body: { gap: space.xl },
  review: { marginBottom: space.xl, gap: space.md },
  notes: { gap: space.xs, marginBottom: space.xl },
  bodyWide: { flexDirection: "row", alignItems: "flex-start" },
  col: { flex: 1, gap: space.md },
  cardRow: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  time: { width: 44, paddingTop: space.md },
  grow: { flex: 1 },
});
