/**
 * Admin → Instructions (R11, D-034, T-060): the short rules the AI learned from card ratings.
 * Edit, reorder, switch off, delete, add; every save is a new version that applies from the next
 * call; any version can be restored; "review before apply" holds new learned versions for
 * approval. Card-rating aggregates sit underneath (T-058).
 */
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  minTouchTarget,
  Panel,
  radius,
  Stack,
  space,
  Text,
  TextField,
  ToggleRow,
  useTheme,
} from "@sotto/ui";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { FeatureGate } from "../../components/FeatureGate";
import {
  type Draft,
  type LearnedVersion,
  type Learning,
  learningApi,
  type RatingSummary,
  wordCount,
} from "../../features/learning/api";
import { clearLearningBadge } from "../../features/learning/badge";
import type { StringKey } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";
import { useCloud } from "../../lib/useCloud";

export default function InstructionsRoute() {
  return (
    <FeatureGate feature="learned_instructions">
      <InstructionsScreen />
    </FeatureGate>
  );
}

const sameList = (a: Draft[], b: Draft[]) =>
  JSON.stringify(a.map(({ id, text, enabled }) => [id, text.trim(), enabled])) ===
  JSON.stringify(b.map(({ id, text, enabled }) => [id, text.trim(), enabled]));

const toDrafts = (l: Learning): Draft[] =>
  l.items.map(({ id, text, enabled }) => ({ id, text, enabled }));

export function InstructionsScreen() {
  const { t, locale } = useI18n();
  const cloud = useCloud();
  const [data, setData] = useState<Learning | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [summary, setSummary] = useState<RatingSummary | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newCount, setNewCount] = useState(0);

  const take = useCallback((l: Learning) => {
    setData(l);
    setDrafts(toDrafts(l));
  }, []);

  useEffect(() => {
    if (cloud.status !== "signed_in") return;
    learningApi
      .get()
      .then((l) => {
        take(l);
        setNewCount(l.new);
        if (l.new > 0) void learningApi.seen().then(clearLearningBadge, () => {});
      })
      .catch(() => setNote(t("learning.error")));
    learningApi.summary().then(setSummary, () => {});
  }, [cloud.status, take, t]);

  const run = useCallback(
    (p: Promise<Learning>, saved = true) => {
      setBusy(true);
      setNote(null);
      p.then((l) => {
        take(l);
        if (saved) setNote(t("learning.saved"));
      })
        .catch(() => setNote(t("learning.error")))
        .finally(() => setBusy(false));
    },
    [take, t],
  );

  if (cloud.status !== "signed_in") {
    return <EmptyState testID="instructions-none" title={t("learning.title")} />;
  }
  const limits = data?.limits ?? { items: 8, words: 25 };
  const valid = drafts.every((d) => {
    const n = wordCount(d.text);
    return n > 0 && n <= limits.words;
  });
  const dirty = data ? !sameList(drafts, toDrafts(data)) : false;
  const edit = (i: number, change: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...change } : d)));
  const move = (i: number, by: -1 | 1) =>
    setDrafts((ds) => {
      const next = [...ds];
      const [it] = next.splice(i, 1);
      if (it) next.splice(i + by, 0, it);
      return next;
    });
  const date = (ms: number) => new Date(ms).toLocaleDateString(locale);
  const pending = data?.versions.filter((v) => v.status === "pending") ?? [];

  return (
    <Stack gap="lg" testID="admin-instructions">
      <View style={styles.head}>
        <Text variant="heading" weight="semibold" accessibilityRole="header">
          {t("learning.title")}
        </Text>
        {newCount > 0 ? (
          <Badge
            testID="instructions-new"
            label={t("learning.badge", { count: newCount })}
            tone="primary"
          />
        ) : null}
      </View>
      <Text variant="body" tone="muted">
        {t("learning.body")}
      </Text>
      {note ? (
        <Text variant="label" tone="muted" accessibilityLiveRegion="polite" aria-live="polite">
          {note}
        </Text>
      ) : null}

      {pending.map((v) => (
        <Panel key={v.version} testID={`pending-${v.version}`}>
          <Stack gap="sm">
            <View style={styles.head}>
              <Badge label={t("learning.pending")} tone="notice" />
              <Text variant="label" tone="muted">
                {`${t("learning.version", { n: v.version })} · ${date(v.created_at)}`}
              </Text>
            </View>
            {v.items.map((it) => (
              <Text key={it.id} variant="body">{`• ${it.text}`}</Text>
            ))}
            <View style={styles.actions}>
              <Button
                testID={`approve-${v.version}`}
                label={t("learning.approve")}
                disabled={busy}
                onPress={() => run(learningApi.decide(v.version, true))}
              />
              <Button
                testID={`reject-${v.version}`}
                label={t("learning.reject")}
                variant="secondary"
                disabled={busy}
                onPress={() => run(learningApi.decide(v.version, false))}
              />
            </View>
          </Stack>
        </Panel>
      ))}

      <Panel>
        <ToggleRow
          testID="review-switch"
          label={t("learning.review")}
          description={t("learning.reviewBody")}
          value={data?.review_before_apply ?? false}
          onValueChange={(on) => {
            if (!busy) run(learningApi.setReview(on), false);
          }}
        />
      </Panel>

      <Panel>
        <Stack gap="md">
          <Text variant="label" tone="muted">
            {t("learning.limit", { items: limits.items, words: limits.words })}
          </Text>
          {data && drafts.length === 0 ? (
            <Text tone="muted" testID="instructions-empty">
              {t("learning.empty")}
            </Text>
          ) : null}
          {drafts.map((d, i) => {
            const item = data?.items.find((x) => x.id === d.id);
            const words = wordCount(d.text);
            return (
              <Row
                key={d.id ?? `new-${i}`}
                index={i}
                draft={d}
                words={words}
                maxWords={limits.words}
                first={i === 0}
                last={i === drafts.length - 1}
                source={
                  item
                    ? item.source_call
                      ? t("learning.source", {
                          call: item.source_call.slice(0, 8),
                          date: date(item.added_at),
                        })
                      : t("learning.sourceManual", { date: date(item.added_at) })
                    : null
                }
                onText={(text) => edit(i, { text })}
                onEnabled={(enabled) => edit(i, { enabled })}
                onMove={(by) => move(i, by)}
                onDelete={() => setDrafts((ds) => ds.filter((_, j) => j !== i))}
              />
            );
          })}
          <View style={styles.actions}>
            <Button
              testID="instruction-add"
              label={t("learning.add")}
              variant="secondary"
              disabled={drafts.length >= limits.items}
              onPress={() => setDrafts((ds) => [...ds, { text: "", enabled: true }])}
            />
            <Button
              testID="instructions-save"
              label={t("learning.save")}
              disabled={busy || !dirty || !valid}
              onPress={() => run(learningApi.save(drafts))}
            />
          </View>
        </Stack>
      </Panel>

      <Ratings summary={summary} />

      {data && data.versions.length > 0 ? (
        <Stack gap="sm">
          <Text variant="label" weight="semibold" tone="muted" accessibilityRole="header">
            {t("learning.versions")}
          </Text>
          <Panel>
            {data.versions.map((v, i) => (
              <VersionRow
                key={v.version}
                v={v}
                divided={i > 0}
                date={date(v.created_at)}
                busy={busy}
                onRevert={() => run(learningApi.revert(v.version))}
              />
            ))}
          </Panel>
        </Stack>
      ) : null}
    </Stack>
  );
}

function Row(props: {
  index: number;
  draft: Draft;
  words: number;
  maxWords: number;
  first: boolean;
  last: boolean;
  source: string | null;
  onText: (t: string) => void;
  onEnabled: (on: boolean) => void;
  onMove: (by: -1 | 1) => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const { color } = useTheme();
  const over = props.words > props.maxWords;
  const n = props.index + 1;
  return (
    <View
      testID={`instruction-${props.index}`}
      style={[styles.item, { borderColor: color.border, opacity: props.draft.enabled ? 1 : 0.75 }]}
    >
      <TextField
        testID={`instruction-text-${props.index}`}
        accessibilityLabel={t("learning.field", { n })}
        value={props.draft.text}
        onChangeText={props.onText}
        multiline
      />
      <View style={styles.meta}>
        <Text variant="label" tone={over ? "danger" : "muted"}>
          {t("learning.words", { count: props.words, max: props.maxWords })}
        </Text>
        {props.source ? (
          <Text variant="label" tone="muted">
            {props.source}
          </Text>
        ) : null}
      </View>
      <View style={styles.tools}>
        <View style={styles.toggle}>
          <Switch
            testID={`instruction-on-${props.index}`}
            accessibilityLabel={`${t("learning.enabled")} · ${t("learning.field", { n })}`}
            value={props.draft.enabled}
            onValueChange={props.onEnabled}
            trackColor={{ true: color.primary, false: color.borderStrong }}
          />
          <Text variant="label" tone="muted">
            {t("learning.enabled")}
          </Text>
        </View>
        <IconButton
          testID={`instruction-up-${props.index}`}
          icon="chevron"
          flip
          label={`${t("learning.moveUp")} · ${t("learning.field", { n })}`}
          disabled={props.first}
          onPress={() => props.onMove(-1)}
        />
        <IconButton
          testID={`instruction-down-${props.index}`}
          icon="chevron"
          label={`${t("learning.moveDown")} · ${t("learning.field", { n })}`}
          disabled={props.last}
          onPress={() => props.onMove(1)}
        />
        <IconButton
          testID={`instruction-delete-${props.index}`}
          icon="close"
          label={`${t("learning.delete")} · ${t("learning.field", { n })}`}
          onPress={props.onDelete}
        />
      </View>
    </View>
  );
}

function IconButton(props: {
  icon: "chevron" | "close";
  label: string;
  onPress: () => void;
  disabled?: boolean;
  flip?: boolean;
  testID: string;
}) {
  const { color } = useTheme();
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: !!props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={[styles.iconBtn, { opacity: props.disabled ? 0.4 : 1 }]}
    >
      {/* The chevron glyph points down; "up" turns it over. */}
      <View style={props.flip ? { transform: [{ rotate: "180deg" }] } : null}>
        <Icon name={props.icon} size={18} color={color.textMuted} />
      </View>
    </Pressable>
  );
}

const ORIGIN: Record<LearnedVersion["origin"], StringKey> = {
  learning: "learning.origin.learning",
  edit: "learning.origin.edit",
  revert: "learning.origin.revert",
};

function VersionRow(props: {
  v: LearnedVersion;
  divided: boolean;
  date: string;
  busy: boolean;
  onRevert: () => void;
}) {
  const { t } = useI18n();
  const { color } = useTheme();
  const { v } = props;
  return (
    <View
      testID={`version-${v.version}`}
      style={[
        styles.version,
        props.divided
          ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border }
          : null,
      ]}
    >
      <View style={styles.versionText}>
        <View style={styles.head}>
          <Text weight="semibold">{t("learning.version", { n: v.version })}</Text>
          <Badge label={t(ORIGIN[v.origin])} tone="neutral" />
          {v.active ? <Badge label={t("learning.active")} tone="answer" /> : null}
          {v.status === "pending" ? <Badge label={t("learning.pending")} tone="notice" /> : null}
          {v.status === "rejected" ? <Badge label={t("learning.rejected")} tone="neutral" /> : null}
        </View>
        <Text variant="label" tone="muted">
          {[props.date, v.actor, `${v.items.length} · ${v.items.map((i) => i.text).join(" / ")}`]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      {!v.active && v.status !== "pending" ? (
        <Button
          testID={`revert-${v.version}`}
          label={t("learning.revert")}
          variant="ghost"
          disabled={props.busy}
          onPress={props.onRevert}
        />
      ) : null}
    </View>
  );
}

const REASON_KEYS: Record<string, StringKey> = {
  wrong: "rating.reason.wrong",
  too_long: "rating.reason.too_long",
  not_our_style: "rating.reason.not_our_style",
  good_phrasing: "rating.reason.good_phrasing",
};

function Ratings({ summary }: { summary: RatingSummary | null }) {
  const { t } = useI18n();
  if (!summary) return null;
  return (
    <Stack gap="sm" testID="ratings-summary">
      <Text variant="label" weight="semibold" tone="muted" accessibilityRole="header">
        {t("learning.ratings")}
      </Text>
      <Panel>
        {summary.total === 0 ? (
          <Text tone="muted">{t("learning.ratingsNone")}</Text>
        ) : (
          <Stack gap="sm">
            <Text weight="medium">
              {t("learning.ratingsBody", {
                up: summary.up,
                down: summary.down,
                calls: summary.calls,
              })}
            </Text>
            <Text variant="label" tone="muted">
              {`${t("learning.reasons")}: ${Object.entries(summary.reasons)
                .filter(([, n]) => n > 0)
                .map(([r, n]) => `${REASON_KEYS[r] ? t(REASON_KEYS[r]) : r} ${n}`)
                .join(" · ")}`}
            </Text>
            <Text variant="label" tone="muted">
              {`${t("learning.byPerson")}: ${summary.people
                .map((p) => `${p.name} ${p.up}/${p.down}`)
                .join(" · ")}`}
            </Text>
          </Stack>
        )}
      </Panel>
    </Stack>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.sm },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  item: { borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  tools: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.xs },
  toggle: { flexDirection: "row", alignItems: "center", gap: space.xs, marginEnd: space.sm },
  iconBtn: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  version: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space.sm,
    paddingVertical: space.sm,
  },
  versionText: { flex: 1, minWidth: 200, gap: space.xs },
});
