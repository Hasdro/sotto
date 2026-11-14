/** Admin: one prompt's versions (R6, DD-2): new draft, test on the recorded calls (quality +
 * latency), publish, roll back. D-059: only while AGN allows BYO for the company. */
import { Badge, Button, EmptyState, LtrRun, Panel, Stack, Text, TextField } from "@sotto/ui";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ByoGate, OnServer } from "../../../features/keys/byo";
import { useByoText } from "../../../features/keys/strings";
import {
  canPublish,
  type PromptVersionRow,
  promptsApi,
  type StudioKey,
} from "../../../features/prompts/api";
import { configInWebOnly, WebAdminNotice } from "../../../features/webadmin/webAdmin";

/** D-038: on the desktop app this screen is replaced by a link to the web admin panel. */
export default function PromptDetailScreen() {
  return configInWebOnly() ? (
    <WebAdminNotice />
  ) : (
    <ByoGate>
      <OnServer>
        <PromptDetailScreenBody />
      </OnServer>
    </ByoGate>
  );
}

function PromptDetailScreenBody() {
  const t = useByoText();
  const { key } = useLocalSearchParams<{ key: string }>();
  const [prompt, setPrompt] = useState<StudioKey | null | "offline">(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    promptsApi
      .list()
      .then((r) => {
        const found = r.prompts.find((p) => p.key === key) ?? null;
        setPrompt(found);
        if (found) setDraft((d) => d || found.seed.body);
      })
      .catch(() => setPrompt("offline"));
  }, [key]);
  useEffect(load, [load]);

  const act = async (id: string, run: () => Promise<unknown>) => {
    setBusy(id);
    setError(null);
    try {
      await run();
      load();
    } catch (e) {
      setError(t("prompts.failed", { error: e instanceof Error ? e.message : "?" }));
    } finally {
      setBusy(null);
    }
  };

  if (prompt === "offline") return <EmptyState title={t("prompts.offline")} />;
  if (prompt === null) return null;
  const versions = [...prompt.versions].reverse();
  return (
    <Stack gap="md" testID="prompt-detail">
      <Text variant="title" accessibilityRole="header">
        {prompt.key}
      </Text>
      <Text tone="muted">
        {t("prompts.variables", { list: prompt.variables.join(", ") || "—" })}
      </Text>
      <Panel>
        <Stack gap="sm">
          <TextField
            label={t("prompts.editor")}
            multiline
            height={220}
            value={draft}
            onChangeText={setDraft}
            testID="prompt-editor"
          />
          <Button
            label={t("prompts.save")}
            testID="prompt-save"
            disabled={busy !== null}
            onPress={() => act("new", () => promptsApi.create(prompt.key, draft))}
          />
        </Stack>
      </Panel>
      {error ? (
        <Text tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {versions.map((v) => (
        <VersionRow key={v.id} v={v} busy={busy} act={act} />
      ))}
    </Stack>
  );
}

function VersionRow({
  v,
  busy,
  act,
}: {
  v: PromptVersionRow;
  busy: string | null;
  act: (id: string, run: () => Promise<unknown>) => Promise<void>;
}) {
  const t = useByoText();
  const status = {
    draft: "prompts.status.draft",
    published: "prompts.status.published",
    retired: "prompts.status.retired",
  } as const;
  return (
    <Panel testID={`prompt-version-${v.version}`}>
      <Stack gap="sm">
        <Stack direction="row" gap="sm" align="center">
          <Text weight="semibold">{t("prompts.version", { version: String(v.version) })}</Text>
          <Badge
            label={t(status[v.status])}
            tone={v.status === "published" ? "primary" : "neutral"}
            dot={v.status === "published"}
          />
        </Stack>
        {v.test ? (
          <Text tone={v.test.passed ? "muted" : "danger"}>
            <LtrRun>
              {v.test.p95_ms !== undefined
                ? t("prompts.result", {
                    quality: `${Math.round(v.test.quality * 100)}%`,
                    p50: String(v.test.p50_ms ?? "—"),
                    p95: String(v.test.p95_ms),
                    detail: v.test.detail,
                  })
                : t("prompts.resultPlain", { detail: v.test.detail })}
            </LtrRun>
          </Text>
        ) : null}
        <Stack direction="row" gap="sm">
          <Button
            variant="secondary"
            label={busy === `test-${v.id}` ? t("prompts.testing") : t("prompts.test")}
            disabled={busy !== null}
            testID={`prompt-test-${v.version}`}
            onPress={() => act(`test-${v.id}`, () => promptsApi.test(v.id))}
          />
          {canPublish(v) ? (
            <Button
              label={t("prompts.publish")}
              disabled={busy !== null}
              testID={`prompt-publish-${v.version}`}
              onPress={() => act(`pub-${v.id}`, () => promptsApi.publish(v.id))}
            />
          ) : null}
          {v.status === "published" ? (
            <Button
              variant="secondary"
              label={t("prompts.unpublish")}
              disabled={busy !== null}
              testID={`prompt-unpublish-${v.version}`}
              onPress={() => act(`unpub-${v.id}`, () => promptsApi.unpublish(v.id))}
            />
          ) : null}
        </Stack>
      </Stack>
    </Panel>
  );
}
