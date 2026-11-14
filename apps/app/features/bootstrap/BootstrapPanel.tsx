/**
 * Playbook bootstrap (ZC-04, D-066) on the Playbook page, for managers and admins. Pick a source,
 * the device drafts pairs on the summary model, the server keeps them as "needs review", and each
 * one reaches the playbook (and so a call) only through Approve. Without the consent record (D-063)
 * the panel says what the admin must do and drafts nothing.
 */
import { buildRuntime, type CallBundle } from "@sotto/engine";
import { Badge, Button, Panel, SegmentedControl, Stack, space, Text, TextField } from "@sotto/ui";
import { useCallback, useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { MAX_ANSWER_WORDS, wordCount } from "../escalations/flow";
import { type BootstrapSource, type BootstrapState, bootstrapApi, type Draft } from "./api";
import { draftPairs } from "./draft";
import { useBootText } from "./strings";

type Phase =
  | { kind: "idle" }
  | { kind: "drafting" }
  | { kind: "added"; count: number }
  | { kind: "none" }
  | { kind: "failed"; error: string };

function defaultFetch(): typeof fetch | undefined {
  return Platform.OS === "web"
    ? undefined
    : (require("expo/fetch") as { fetch: typeof fetch }).fetch;
}

export function useBootstrap() {
  const [state, setState] = useState<BootstrapState | null>(null);
  const reload = useCallback(
    () =>
      bootstrapApi.state().then(
        (s) => setState(s),
        () => setState(null),
      ),
    [],
  );
  useEffect(() => {
    void reload();
  }, [reload]);
  return { state, reload };
}

export function BootstrapPanel({
  bundle,
  onApproved,
  fetchFn,
}: {
  bundle: CallBundle | null;
  onApproved: () => void;
  fetchFn?: typeof fetch;
}) {
  const bt = useBootText();
  const { state, reload } = useBootstrap();
  const [source, setSource] = useState<BootstrapSource>("website");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  if (!state) return null;

  const domains = state.domains;
  const ready =
    source === "website" ? url.trim().length > 0 : source === "zoho" ? state.zoho : text.trim();
  const canDraft = state.consent && Boolean(bundle?.prompts.playbook_bootstrap) && Boolean(ready);

  const run = async () => {
    if (!bundle) return;
    setPhase({ kind: "drafting" });
    try {
      const material =
        source === "document"
          ? text
          : (
              await bootstrapApi.material(
                source === "website" ? { source, url: url.trim() } : { source },
              )
            ).text;
      const runtime = buildRuntime(bundle, undefined, fetchFn ?? defaultFetch());
      const pairs = await draftPairs({
        router: runtime.router,
        bundle,
        source,
        material,
        now: Date.now(),
      });
      if (pairs === null || pairs.length === 0) {
        setPhase({ kind: "none" });
        return;
      }
      const { added } = await bootstrapApi.drafts(source, pairs);
      setPhase({ kind: "added", count: added });
      void reload();
    } catch (err) {
      setPhase({ kind: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <Stack gap="sm" testID="bootstrap">
      <Panel>
        <Stack gap="sm">
          <Text variant="title" accessibilityRole="header">
            {bt("boot.title")}
          </Text>
          <Text tone="muted">{bt("boot.body")}</Text>
          {!state.consent ? (
            <Text testID="bootstrap-consent" tone="danger">
              {bt("boot.consent")}
            </Text>
          ) : (
            <>
              <SegmentedControl
                testID="bootstrap-source"
                accessibilityLabel={bt("boot.source")}
                value={source}
                onChange={(v) => {
                  setSource(v);
                  setPhase({ kind: "idle" });
                }}
                options={[
                  { value: "website", label: bt("boot.source.website") },
                  { value: "zoho", label: bt("boot.source.zoho") },
                  { value: "document", label: bt("boot.source.document") },
                ]}
              />
              {source === "website" ? (
                <Stack gap="xs">
                  <TextField
                    testID="bootstrap-url"
                    label={bt("boot.url")}
                    value={url}
                    onChangeText={setUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    placeholder={domains[0] ? `https://${domains[0]}/` : "https://"}
                  />
                  <Text variant="label" tone="muted">
                    {domains.length
                      ? bt("boot.urlHint", { domains: domains.join(", ") })
                      : bt("boot.noDomain")}
                  </Text>
                </Stack>
              ) : null}
              {source === "zoho" ? (
                <Text variant="label" tone="muted">
                  {state.zoho ? bt("boot.zohoHint") : bt("boot.zohoOff")}
                </Text>
              ) : null}
              {source === "document" ? (
                <Stack gap="xs">
                  <TextField
                    testID="bootstrap-text"
                    label={bt("boot.document")}
                    value={text}
                    onChangeText={setText}
                    multiline
                    height={140}
                  />
                  <Text variant="label" tone="muted">
                    {bt("boot.documentHint")}
                  </Text>
                </Stack>
              ) : null}
              {bundle && !bundle.prompts.playbook_bootstrap ? (
                <Text variant="label" tone="danger">
                  {bt("boot.noModel")}
                </Text>
              ) : null}
              <View style={styles.row}>
                <Button
                  testID="bootstrap-run"
                  label={phase.kind === "drafting" ? bt("boot.drafting") : bt("boot.draft")}
                  disabled={!canDraft || phase.kind === "drafting"}
                  onPress={() => void run()}
                />
              </View>
              <PhaseLine phase={phase} />
            </>
          )}
        </Stack>
      </Panel>
      {state.drafts.length ? (
        <Stack gap="sm" testID="bootstrap-review">
          <Text variant="label" weight="semibold" tone="muted" accessibilityRole="header">
            {bt("boot.review", { count: String(state.drafts.length) })}
          </Text>
          {state.drafts.map((d) => (
            <DraftCard
              key={d.id}
              d={d}
              onDone={(approved) => {
                void reload();
                if (approved) onApproved();
              }}
            />
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}

function PhaseLine({ phase }: { phase: Phase }) {
  const bt = useBootText();
  if (phase.kind === "added")
    return (
      <Text testID="bootstrap-added" accessibilityLiveRegion="polite">
        {bt("boot.added", { count: String(phase.count) })}
      </Text>
    );
  if (phase.kind === "none")
    return (
      <Text tone="muted" accessibilityLiveRegion="polite">
        {bt("boot.none")}
      </Text>
    );
  if (phase.kind === "failed")
    return (
      <Text testID="bootstrap-failed" tone="danger" accessibilityLiveRegion="polite">
        {bt("boot.failed", { error: phase.error })}
      </Text>
    );
  return null;
}

function DraftCard({ d, onDone }: { d: Draft; onDone: (approved: boolean) => void }) {
  const bt = useBootText();
  const [question, setQuestion] = useState(d.question);
  const [answer, setAnswer] = useState(d.answer);
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
    <Panel testID={`draft-${d.id}`}>
      <Stack gap="sm">
        <View style={styles.row}>
          <Badge tone="notice" label={bt(`boot.from.${d.source}`)} />
        </View>
        <TextField
          testID={`draft-question-${d.id}`}
          label={bt("boot.question")}
          value={question}
          onChangeText={setQuestion}
        />
        <TextField
          testID={`draft-answer-${d.id}`}
          label={bt("boot.answer")}
          value={answer}
          onChangeText={setAnswer}
          multiline
        />
        {words > MAX_ANSWER_WORDS ? (
          <Text variant="label" tone="danger">
            {bt("boot.tooLong", { max: String(MAX_ANSWER_WORDS) })}
          </Text>
        ) : null}
        {failed ? (
          <Text variant="label" tone="danger" accessibilityLiveRegion="polite">
            {bt("boot.error")}
          </Text>
        ) : null}
        <View style={styles.row}>
          <Button
            testID={`draft-approve-${d.id}`}
            label={bt("boot.approve")}
            disabled={busy || !valid}
            onPress={() =>
              decide(
                bootstrapApi.approve(d.id, { question: question.trim(), answer: answer.trim() }),
                true,
              )
            }
          />
          <Button
            testID={`draft-reject-${d.id}`}
            label={bt("boot.reject")}
            variant="secondary"
            disabled={busy}
            onPress={() => decide(bootstrapApi.reject(d.id), false)}
          />
        </View>
      </Stack>
    </Panel>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.sm },
});
