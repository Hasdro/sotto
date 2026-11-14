/**
 * Playbook, searchable (R2 step 1: approved answers come first; R3: managers edit it, P3.5).
 * On a Sotto server it shows the playbook calls actually use, and managers and admins can add,
 * edit and remove their own answers; only the local demo (no Sotto server) shows the sample
 * playbook, so a real account never sees another company's answers (T-024).
 */
import {
  Badge,
  Button,
  EmptyState,
  layout,
  Panel,
  Screen,
  space,
  Text,
  TextField,
  useTheme,
} from "@sotto/ui";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { PageHeader } from "../components/PageHeader";
import { type Step, TutorialDialog } from "../components/Tutorial";
import { setPrefs, usePrefs } from "../lib/prefs";

/** What the playbook is and how it feeds the cards (owner, 21 Oct). */
const PLAYBOOK_GUIDE: readonly Step[] = [
  { mascot: "idle", title: "playbook.guide.1.title", body: "playbook.guide.1.body" },
  { mascot: "thinking", title: "playbook.guide.2.title", body: "playbook.guide.2.body" },
  {
    mascot: "suggesting",
    title: "playbook.guide.3.title",
    body: "playbook.guide.3.body",
    demo: "card",
  },
  { mascot: "reviewing", title: "playbook.guide.4.title", body: "playbook.guide.4.body" },
];

import { MAX_ANSWER_WORDS, wordCount } from "../features/escalations/flow";
import { useEscalations } from "../features/escalations/store";
import { type PlaybookEntry, searchPlaybook } from "../features/playbook/mock";
import { Suggestions } from "../features/playbook/Suggestions";
import { type EntryInput, parseTags, useServerPlaybook } from "../features/playbook/server";
import { cloudActive, sampleDataAllowed } from "../lib/cloud";
import { formatDate } from "../lib/format";
import type { StringKey } from "../lib/i18n";
import { useI18n } from "../lib/locale";
import { useRole } from "../lib/role";
import { ApiError } from "../lib/server";

const SOURCE_LABEL: Record<NonNullable<PlaybookEntry["source"]>, StringKey> = {
  file: "playbook.source.file",
  inbox: "playbook.source.inbox",
  custom: "playbook.source.custom",
};

export default function PlaybookScreen() {
  const { t, locale } = useI18n();
  const { color } = useTheme();
  const { role } = useRole();
  const [query, setQuery] = useState("");
  const { playbookHelpSeen } = usePrefs();
  const samples = useEscalations().playbook;
  const server = useServerPlaybook();
  const playbook = server.entries ?? (sampleDataAllowed() ? samples : []);
  const nothingYet = playbook.length === 0;
  const canEdit = server.entries !== null && role !== "agent";
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const results = useMemo(() => searchPlaybook(playbook, query), [playbook, query]);
  return (
    <Screen scroll maxWidth={layout.readableMaxWidth + 160} testID="playbook" style={styles.page}>
      <PageHeader
        icon="playbook"
        title={t("playbook.title")}
        subtitle={t("playbook.subtitle")}
        actions={
          <Button
            variant="secondary"
            label={t("playbook.help")}
            onPress={() => setPrefs({ playbookHelpSeen: false })}
            testID="playbook-help"
          />
        }
      />
      {playbookHelpSeen ? null : (
        <TutorialDialog
          steps={PLAYBOOK_GUIDE}
          testID="playbook-guide"
          onClose={() => setPrefs({ playbookHelpSeen: true })}
        />
      )}
      <View style={styles.search}>
        <TextField
          accessibilityLabel={t("playbook.search")}
          placeholder={t("playbook.searchPlaceholder")}
          value={query}
          onChangeText={setQuery}
          testID="playbook-search"
        />
        <View style={styles.searchRow}>
          <Text variant="label" tone="muted" accessibilityLiveRegion="polite">
            {t("playbook.count", { count: results.length })}
          </Text>
          {canEdit && editing === null ? (
            <Button
              label={t("playbook.add")}
              variant="secondary"
              onPress={() => setEditing("new")}
              testID="playbook-add"
            />
          ) : null}
        </View>
      </View>
      {/* INT-15: approval cards for managers; nothing is added without "Approve". */}
      {canEdit && cloudActive() ? <Suggestions onApproved={() => void server.reload()} /> : null}
      {editing === "new" ? (
        <Panel style={styles.formPanel}>
          <EntryForm
            onCancel={() => setEditing(null)}
            onSave={(input) => server.add(input).then(() => setEditing(null))}
          />
        </Panel>
      ) : null}
      {nothingYet ? (
        <EmptyState
          title={t("playbook.none.title")}
          body={t(canEdit ? "playbook.none.bodyEdit" : "playbook.none.body")}
        />
      ) : results.length === 0 ? (
        <EmptyState title={t("playbook.empty.title")} body={t("playbook.empty.body")} />
      ) : (
        <Panel padded={false}>
          {results.map((e, i) => (
            <View
              key={e.id}
              testID={`entry-${e.id}`}
              style={[
                styles.row,
                i > 0 ? { borderTopColor: color.border, borderTopWidth: 1 } : null,
              ]}
            >
              {editing === e.id ? (
                <EntryForm
                  initial={e}
                  onCancel={() => setEditing(null)}
                  onSave={(input) => server.edit(e.id, input).then(() => setEditing(null))}
                />
              ) : (
                <>
                  <Text variant="body" weight="semibold">
                    {e.question}
                  </Text>
                  <Text variant="body">{e.answer}</Text>
                  <View style={styles.tags}>
                    {e.source ? <Badge label={t(SOURCE_LABEL[e.source])} tone="primary" /> : null}
                    {e.tags.map((tag) => (
                      <Badge key={tag} label={tag} />
                    ))}
                    {e.updated ? (
                      <Text variant="label" tone="muted">
                        {t("playbook.updated", { date: formatDate(e.updated, locale) })}
                      </Text>
                    ) : null}
                  </View>
                  {canEdit && editing === null && e.source && e.source !== "file" ? (
                    <View style={styles.actions}>
                      <Button
                        label={t("playbook.edit")}
                        variant="ghost"
                        onPress={() => setEditing(e.id)}
                        testID={`edit-${e.id}`}
                      />
                      <RemoveButton onRemove={() => server.remove(e.id)} id={e.id} />
                    </View>
                  ) : null}
                </>
              )}
            </View>
          ))}
        </Panel>
      )}
    </Screen>
  );
}

function RemoveButton({ id, onRemove }: { id: string; onRemove: () => Promise<void> }) {
  const { t } = useI18n();
  const [armed, setArmed] = useState(false);
  return (
    <Button
      label={t(armed ? "playbook.removeConfirm" : "playbook.remove")}
      variant={armed ? "danger" : "ghost"}
      onPress={() => (armed ? void onRemove() : setArmed(true))}
      testID={`remove-${id}`}
    />
  );
}

function EntryForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: PlaybookEntry;
  onSave: (input: EntryInput) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [answer, setAnswer] = useState(initial?.answer ?? "");
  const [tags, setTags] = useState(initial?.tags.join(", ") ?? "");
  const [error, setError] = useState<string | null>(null);
  const words = wordCount(answer);
  const submit = () => {
    const q = question.trim();
    if (q.length < 3 || q.length > 300) return setError(t("playbook.error.question"));
    if (words === 0) return setError(t("inbox.error.empty"));
    if (words > MAX_ANSWER_WORDS) {
      return setError(t("inbox.error.too_long", { max: MAX_ANSWER_WORDS }));
    }
    setError(null);
    onSave({ question: q, answer: answer.trim(), tags: parseTags(tags) }).catch((err: unknown) =>
      setError(
        t("playbook.error.server", { message: err instanceof ApiError ? err.message : "?" }),
      ),
    );
  };
  return (
    <View style={styles.form}>
      <TextField
        label={t("playbook.form.question")}
        value={question}
        onChangeText={setQuestion}
        maxLength={300}
        testID="form-question"
      />
      <TextField
        label={t("playbook.form.answer")}
        value={answer}
        onChangeText={setAnswer}
        multiline
        testID="form-answer"
      />
      <Text variant="label" tone={words > MAX_ANSWER_WORDS ? "danger" : "muted"}>
        {t("inbox.answer.words", { n: words, max: MAX_ANSWER_WORDS })}
      </Text>
      <TextField
        label={t("playbook.form.tags")}
        value={tags}
        onChangeText={setTags}
        autoCapitalize="none"
        testID="form-tags"
      />
      {error ? (
        <Text variant="label" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button label={t("playbook.save")} onPress={submit} testID="form-save" />
        <Button label={t("playbook.cancel")} variant="ghost" onPress={onCancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { paddingTop: space.xl },
  search: { gap: space.sm, marginBottom: space.lg },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    flexWrap: "wrap",
  },
  formPanel: { marginBottom: space.lg },
  form: { gap: space.sm },
  row: { padding: space.lg, gap: space.xs },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.sm,
    marginTop: space.xs,
  },
  actions: { flexDirection: "row", gap: space.sm, flexWrap: "wrap", marginTop: space.xs },
});
