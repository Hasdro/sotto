/**
 * Admin: one prompt in the studio (R6, P6.2): scope, versions with publish and one-click
 * rollback, a draft editor with the variable catalogue, and the diff against the live version.
 * Mock store; Phase 6 writes `prompt_versions` (audited by the DB trigger).
 */
import {
  Badge,
  type BadgeTone,
  Button,
  EmptyState,
  minTouchTarget,
  Panel,
  radius,
  SegmentedControl,
  Stack,
  space,
  Text,
  TextField,
  useTheme,
} from "@sotto/ui";
import { Link, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { usePrompts } from "../../../features/prompts/store";
import {
  type DiffLine,
  draftOf,
  lineDiff,
  publishedOf,
  type Scope,
  unknownVariables,
  type VersionStatus,
} from "../../../features/prompts/studio";
import { useI18n } from "../../../lib/locale";

const SCOPES: readonly Scope[] = ["platform", "company", "team", "campaign"];
const TONE: Record<VersionStatus, BadgeTone> = {
  published: "answer",
  draft: "notice",
  archived: "neutral",
};

export default function PromptDetailScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { t, dir } = useI18n();
  const { prompts, setScope } = usePrompts();
  const prompt = prompts.find((p) => p.key === key);
  if (!prompt) return <EmptyState title={t("prompts.notFound")} />;
  const live = publishedOf(prompt);
  return (
    <Stack gap="xl" testID="prompt-detail">
      <View style={styles.head}>
        <Link href="/admin/prompts" asChild>
          <Pressable accessibilityRole="link" style={styles.back}>
            <Text variant="label" tone="primary" weight="medium">
              {`${dir === "rtl" ? "→" : "←"} ${t("prompts.back")}`}
            </Text>
          </Pressable>
        </Link>
        <Text variant="heading" weight="semibold" accessibilityRole="header">
          {prompt.key}
        </Text>
        <Text variant="body" tone="muted">
          {prompt.description}
        </Text>
        {live ? (
          <Text variant="body" weight="medium" accessibilityLiveRegion="polite">
            {t("prompts.live", { version: live.version })}
          </Text>
        ) : null}
      </View>
      <View style={styles.block}>
        <Text variant="label" weight="medium" tone="muted">
          {t("prompts.scope")}
        </Text>
        <SegmentedControl
          options={SCOPES.map((s) => ({ value: s, label: t(`prompts.scope.${s}`) }))}
          value={prompt.scope}
          onChange={(s) => setScope(prompt.key, s)}
          accessibilityLabel={t("prompts.scope")}
          testID="prompt-scope"
        />
      </View>
      <Versions promptKey={prompt.key} />
      {/* Remount the editor when the draft version changes, so it starts from that text. */}
      <Editor key={draftOf(prompt)?.version ?? "new"} promptKey={prompt.key} />
    </Stack>
  );
}

function Versions({ promptKey }: { promptKey: string }) {
  const { t, locale } = useI18n();
  const { color } = useTheme();
  const { prompts, publish } = usePrompts();
  const prompt = prompts.find((p) => p.key === promptKey);
  if (!prompt) return null;
  const newestFirst = [...prompt.versions].sort((a, b) => b.version - a.version);
  return (
    <View style={styles.block}>
      <Text variant="body" weight="semibold">
        {t("prompts.versions")}
      </Text>
      <Panel padded={false}>
        {newestFirst.map((v, i) => (
          <View
            key={v.version}
            style={[styles.row, i > 0 ? { borderTopColor: color.border, borderTopWidth: 1 } : null]}
          >
            <Text variant="body" weight="semibold" style={styles.ver}>
              {`v${v.version}`}
            </Text>
            <Badge tone={TONE[v.status]} label={t(`prompts.status.${v.status}`)} />
            <Text variant="label" tone="muted" style={styles.grow}>
              {new Date(v.created).toLocaleDateString(
                locale === "ar" ? "ar-AE-u-nu-latn" : "en-GB",
                {
                  day: "numeric",
                  month: "short",
                },
              )}
            </Text>
            {v.status === "draft" ? (
              <Button
                label={t("prompts.publish")}
                onPress={() => publish(promptKey, v.version)}
                testID={`publish-${v.version}`}
              />
            ) : null}
            {v.status === "archived" ? (
              <Button
                label={t("prompts.rollback")}
                variant="secondary"
                onPress={() => publish(promptKey, v.version)}
                testID={`rollback-${v.version}`}
              />
            ) : null}
          </View>
        ))}
      </Panel>
    </View>
  );
}

function Editor({ promptKey }: { promptKey: string }) {
  const { t } = useI18n();
  const { color } = useTheme();
  const { prompts, save } = usePrompts();
  const prompt = prompts.find((p) => p.key === promptKey);
  const draft = prompt ? draftOf(prompt) : undefined;
  const live = prompt ? publishedOf(prompt) : undefined;
  const [body, setBody] = useState(draft?.body ?? live?.body ?? "");
  if (!prompt) return null;
  const unknown = unknownVariables(body, prompt.variables);
  const diff = draft && live ? lineDiff(live.body, draft.body) : [];
  const changed = diff.some((d) => d.kind !== "same");
  return (
    <View style={styles.block}>
      <TextField
        label={t("prompts.editor")}
        value={body}
        onChangeText={setBody}
        multiline
        numberOfLines={6}
        autoCapitalize="none"
        autoCorrect={false}
        testID="prompt-editor"
      />
      {unknown.length > 0 ? (
        <Text variant="label" tone="negative" accessibilityLiveRegion="polite">
          {t("prompts.unknown", { names: unknown.join(", ") })}
        </Text>
      ) : null}
      <Text variant="label" weight="medium" tone="muted">
        {t("prompts.variables")}
      </Text>
      <View style={styles.chips}>
        {prompt.variables.map((name) => (
          <Pressable
            key={name}
            accessibilityRole="button"
            accessibilityLabel={`${t("prompts.variables")}: ${name}`}
            onPress={() => setBody((b) => `${b}{{${name}}}`)}
            testID={`var-${name}`}
            style={[
              styles.chip,
              { backgroundColor: color.surfaceSunken, borderColor: color.border },
            ]}
          >
            <Text variant="label" weight="medium">{`{{${name}}}`}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.actions}>
        <Button
          label={t("prompts.save")}
          onPress={() => save(promptKey, body)}
          disabled={unknown.length > 0}
          testID="save-draft"
        />
        <Button label={t("prompts.test")} variant="secondary" disabled testID="test-draft" />
      </View>
      <Text variant="label" tone="muted">
        {t("prompts.test.note")}
      </Text>
      {draft && live ? (
        <View style={styles.block}>
          <Text variant="body" weight="semibold">
            {t("prompts.diff")}
          </Text>
          {changed ? (
            <View
              style={[
                styles.diff,
                { backgroundColor: color.surfaceSunken, borderColor: color.border },
              ]}
            >
              {keyed(diff).map(({ id, line: d }) => (
                <Text
                  key={id}
                  variant="label"
                  tone={d.kind === "add" ? "positive" : d.kind === "del" ? "negative" : "muted"}
                >
                  {`${d.kind === "add" ? "+" : d.kind === "del" ? "−" : " "} ${d.text}`}
                </Text>
              ))}
            </View>
          ) : (
            <Text variant="label" tone="muted">
              {t("prompts.diff.none")}
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

/** Stable keys for diff lines: kind + text + how many identical lines came before. */
function keyed(lines: readonly DiffLine[]): { id: string; line: DiffLine }[] {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const base = `${line.kind}:${line.text}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { id: `${base}#${n}`, line };
  });
}

const styles = StyleSheet.create({
  head: { gap: space.xs },
  back: { minHeight: minTouchTarget, justifyContent: "center", alignSelf: "flex-start" },
  block: { gap: space.sm },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  ver: { minWidth: 32 },
  grow: { flexGrow: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    minHeight: minTouchTarget,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  diff: { padding: space.md, borderRadius: radius.md, borderWidth: 1, gap: 2 },
});
