/**
 * Playbook suggestions (INT-15): a question that kept getting "not helpful" AI answers, or a
 * manager's answer to an escalation, as an approval card. The manager writes or edits the answer
 * and approves it (one playbook entry) or rejects it (recorded, not suggested again). Nothing
 * reaches the playbook without that approval (R2 step 5).
 */
import { Badge, Button, Panel, Stack, space, Text, TextField } from "@sotto/ui";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useI18n } from "../../lib/locale";
import { coachingApi, type Suggestion } from "../coaching/api";
import { MAX_ANSWER_WORDS, wordCount } from "../escalations/flow";

export function useSuggestions(enabled: boolean) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const reload = useCallback(() => {
    if (!enabled) return;
    coachingApi.suggestions().then(
      (r) => setItems(r.items),
      () => setItems([]),
    );
  }, [enabled]);
  useEffect(reload, [reload]);
  return { items, reload };
}

export function Suggestions({ onApproved }: { onApproved: () => void }) {
  const { t } = useI18n();
  const { items, reload } = useSuggestions(true);
  const open = items.filter((s) => s.status === "open");
  if (open.length === 0) return null;
  return (
    <Stack gap="sm" testID="playbook-suggestions">
      <Text variant="label" weight="semibold" tone="muted" accessibilityRole="header">
        {t("suggest.title", { count: open.length })}
      </Text>
      {open.map((s) => (
        <SuggestionCard
          key={s.id}
          s={s}
          onDone={(approved) => {
            reload();
            if (approved) onApproved();
          }}
        />
      ))}
    </Stack>
  );
}

function SuggestionCard({ s, onDone }: { s: Suggestion; onDone: (approved: boolean) => void }) {
  const { t } = useI18n();
  const [question, setQuestion] = useState(s.question);
  const [answer, setAnswer] = useState(s.answer);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const words = wordCount(answer);
  const valid = question.trim().length > 0 && words > 0 && words <= MAX_ANSWER_WORDS;
  const decide = (p: Promise<unknown>, approved: boolean) => {
    setBusy(true);
    setFailed(false);
    p.then(
      () => onDone(approved),
      () => setFailed(true),
    ).finally(() => setBusy(false));
  };
  return (
    <Panel testID={`suggestion-${s.id}`}>
      <Stack gap="sm">
        <View style={styles.row}>
          <Badge
            tone="notice"
            label={t(s.source === "escalation" ? "suggest.fromEscalation" : "suggest.fromRatings")}
          />
          <Text variant="label" tone="muted">
            {s.reason}
          </Text>
        </View>
        {s.samples.length > 1 ? (
          <View accessibilityRole="list">
            {s.samples.map((q) => (
              <Text key={q} variant="label" tone="muted">{`“${q}”`}</Text>
            ))}
          </View>
        ) : null}
        <TextField
          testID={`suggestion-question-${s.id}`}
          label={t("suggest.question")}
          value={question}
          onChangeText={setQuestion}
        />
        <TextField
          testID={`suggestion-answer-${s.id}`}
          label={t("suggest.answer")}
          value={answer}
          onChangeText={setAnswer}
          multiline
        />
        {words > MAX_ANSWER_WORDS ? (
          <Text variant="label" tone="danger">
            {t("suggest.tooLong", { max: MAX_ANSWER_WORDS })}
          </Text>
        ) : null}
        {failed ? (
          <Text variant="label" tone="danger" accessibilityLiveRegion="polite">
            {t("suggest.error")}
          </Text>
        ) : null}
        <View style={styles.row}>
          <Button
            testID={`suggestion-approve-${s.id}`}
            label={t("suggest.approve")}
            disabled={busy || !valid}
            onPress={() =>
              decide(
                coachingApi.approve(s.id, { question: question.trim(), answer: answer.trim() }),
                true,
              )
            }
          />
          <Button
            testID={`suggestion-reject-${s.id}`}
            label={t("suggest.reject")}
            variant="secondary"
            disabled={busy}
            onPress={() => decide(coachingApi.reject(s.id), false)}
          />
        </View>
      </Stack>
    </Panel>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.sm },
});
