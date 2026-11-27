/** Unanswered-questions inbox (R2 steps 4–5): open / answered / added to playbook. Mock data. */
import {
  Badge,
  type BadgeTone,
  Button,
  EmptyState,
  layout,
  Panel,
  radius,
  Screen,
  SegmentedControl,
  space,
  Text,
  TextField,
  useTheme,
} from "@sotto/ui";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { PageHeader } from "../components/PageHeader";
import { RoleGate } from "../components/RoleGate";
import { type FlowError, MAX_ANSWER_WORDS, wordCount } from "../features/escalations/flow";
import { useEscalations } from "../features/escalations/store";
import { EXCERPT_SHOWN, excerptTurns } from "../features/inbox/excerpt";
import { byStatus, countByStatus, type InboxItem, type InboxStatus } from "../features/inbox/mock";
import { formatDateTime } from "../lib/format";
import { useI18n } from "../lib/locale";

const STATUSES: readonly InboxStatus[] = ["open", "answered", "added"];
const TONE: Record<InboxStatus, BadgeTone> = {
  open: "objection",
  answered: "question",
  added: "answer",
};

export default function InboxRoute() {
  return (
    <RoleGate area="/inbox">
      <InboxScreen />
    </RoleGate>
  );
}

function InboxScreen() {
  const { t, locale } = useI18n();
  const { color } = useTheme();
  const { inbox, reload } = useEscalations();
  useEffect(reload, [reload]); // questions escalated since the app opened
  const [status, setStatus] = useState<InboxStatus>("open");
  const [added, setAdded] = useState<string | null>(null);
  const counts = countByStatus(inbox);
  const items = byStatus(inbox, status);
  return (
    <Screen scroll maxWidth={layout.readableMaxWidth + 160} testID="inbox" style={styles.page}>
      <PageHeader icon="inbox" title={t("inbox.title")} subtitle={t("inbox.subtitle")} />
      {added ? (
        <Text
          variant="body"
          weight="medium"
          tone="primary"
          accessibilityLiveRegion="polite"
          style={styles.added}
        >
          {t("inbox.answer.added", { question: added })}
        </Text>
      ) : null}
      <View style={styles.filterWrap}>
        <SegmentedControl
          accessibilityLabel={t("inbox.filter")}
          options={STATUSES.map((s) => ({
            value: s,
            label: `${t(`inbox.status.${s}`)}  ${counts[s]}`,
          }))}
          value={status}
          onChange={setStatus}
          testID="inbox-filter"
        />
      </View>
      {items.length === 0 ? (
        <EmptyState title={t("inbox.empty.title")} body={t("inbox.empty.body")} />
      ) : (
        <Panel padded={false}>
          {items.map((item, i) => (
            <View
              key={item.id}
              style={[
                styles.row,
                i > 0 ? { borderTopColor: color.border, borderTopWidth: 1 } : null,
              ]}
            >
              <View style={styles.top}>
                <Text variant="heading" weight="semibold" style={styles.grow}>
                  {item.question}
                </Text>
                <Badge tone={TONE[item.status]} label={t(`inbox.status.${item.status}`)} />
              </View>
              <Text variant="label" tone="muted">
                {t("inbox.askedBy", { customer: item.customer, agent: item.agent })}
              </Text>
              <Text variant="label" tone="muted">
                {formatDateTime(item.askedAt, locale)}
              </Text>
              {item.excerpt ? <Excerpt id={item.id} text={item.excerpt} /> : null}
              {item.status !== "added" ? (
                <AnswerEditor item={item} onAdded={() => setAdded(item.question)} />
              ) : item.answer ? (
                <View
                  style={[
                    styles.answer,
                    { backgroundColor: color.surfaceSunken, borderStartColor: color.primary },
                  ]}
                >
                  <Text variant="label" weight="medium" tone="muted">
                    {t("inbox.answer")}
                  </Text>
                  <Text variant="body">{item.answer}</Text>
                </View>
              ) : null}
            </View>
          ))}
        </Panel>
      )}
    </Screen>
  );
}

/** UI-011: the last turns before the question, with the rest one tap away (raw transcripts ran
 * to 25+ lines and pushed the answer field off screen). Speakers are named per line. */
function Excerpt({ id, text }: { id: string; text: string }) {
  const { t } = useI18n();
  const { color } = useTheme();
  const [all, setAll] = useState(false);
  const turns = excerptTurns(text);
  const shown = all ? turns : turns.slice(-EXCERPT_SHOWN);
  return (
    <View
      testID={`excerpt-${id}`}
      accessibilityLabel={t("inbox.excerpt")}
      style={[
        styles.answer,
        { backgroundColor: color.surfaceSunken, borderStartColor: color.border },
      ]}
    >
      <Text variant="label" weight="medium" tone="muted">
        {t("inbox.excerpt")}
      </Text>
      {shown.map((turn) => (
        <Text key={turn.at} variant="label">
          {turn.speaker ? (
            <Text variant="label" weight="semibold">
              {`${t(turn.speaker === "customer" ? "inbox.speaker.customer" : "inbox.speaker.agent")}: `}
            </Text>
          ) : null}
          {turn.text}
        </Text>
      ))}
      {turns.length > EXCERPT_SHOWN ? (
        <View style={styles.toggle}>
          <Button
            variant="ghost"
            label={all ? t("inbox.excerpt.less") : t("inbox.excerpt.more", { n: turns.length })}
            onPress={() => setAll((v) => !v)}
            testID={`excerpt-toggle-${id}`}
          />
        </View>
      ) : null}
    </View>
  );
}

/** Answer a question, then add it to the playbook (the manager's approval, R2 step 5). */
function AnswerEditor({ item, onAdded }: { item: InboxItem; onAdded: () => void }) {
  const { t } = useI18n();
  const { save, add } = useEscalations();
  const [draft, setDraft] = useState(item.answer ?? "");
  const [error, setError] = useState<FlowError | null>(null);
  const words = wordCount(draft);
  const message = (e: FlowError) => t(`inbox.error.${e}`, { max: MAX_ANSWER_WORDS });
  return (
    <View style={styles.editor}>
      <TextField
        label={t("inbox.answer.label")}
        value={draft}
        onChangeText={(text) => {
          setDraft(text);
          setError(null);
        }}
        multiline
        testID={`answer-${item.id}`}
      />
      {/* UI-011: the cap says why: the answer is read from a live card. */}
      <View style={styles.counter}>
        <Text variant="label" tone={words > MAX_ANSWER_WORDS ? "negative" : "muted"}>
          {t("inbox.answer.words", { n: words, max: MAX_ANSWER_WORDS })}
        </Text>
        <Text variant="label" tone="muted" testID={`answer-cap-${item.id}`}>
          {t("inbox.answer.cap", { max: MAX_ANSWER_WORDS })}
        </Text>
      </View>
      {error ? (
        <Text variant="label" tone="negative" accessibilityLiveRegion="polite">
          {message(error)}
        </Text>
      ) : null}
      {/* UI-011: adding to the playbook is the main step; saving only keeps the answer here. */}
      <View style={styles.actions} testID={`answer-actions-${item.id}`}>
        <Button
          label={t("inbox.answer.add")}
          onPress={() => {
            const e = add(item.id, draft);
            setError(e);
            if (!e) onAdded();
          }}
          testID={`add-${item.id}`}
        />
        <Button
          label={t("inbox.answer.save")}
          variant="outline"
          onPress={() => setError(save(item.id, draft))}
          testID={`save-${item.id}`}
        />
      </View>
      <Text variant="label" tone="muted" testID={`answer-why-${item.id}`}>
        {t("inbox.answer.why")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  added: { marginBottom: space.md },
  editor: { marginTop: space.sm, gap: space.xs },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.xs },
  counter: { flexDirection: "row", flexWrap: "wrap", columnGap: space.sm, rowGap: 2 },
  toggle: { alignItems: "flex-start", marginStart: -space.lg, marginTop: -space.xs },
  page: { paddingTop: space.xl },
  filterWrap: { marginBottom: space.lg },
  row: { padding: space.lg, gap: space.xs },
  top: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  grow: { flex: 1 },
  answer: {
    marginTop: space.sm,
    padding: space.md,
    borderStartWidth: 3,
    borderRadius: radius.lg,
    gap: 2,
  },
});
