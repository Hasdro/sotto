/**
 * Shared Style Memory screen (Round 4, A4): hosts both the Agent view (own rules + company rules +
 * pending versions + effective list) and the Company Admin view (company roll-up, every agent's
 * rules, edit, disable, revert version history, approve/reject pending, promote agent rule to
 * company-wide, and "review before apply" switch). Every admin change is audit-logged server-side.
 */
import {
  Badge,
  Button,
  EmptyState,
  Panel,
  SegmentedControl,
  Stack,
  space,
  Text,
  TextField,
  ToggleRow,
  useTheme,
} from "@sotto/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Switch, View } from "react-native";
import { LoadingLine } from "../../components/LoadingLine";
import { useI18n } from "../../lib/locale";
import { useCloud } from "../../lib/useCloud";
import { wordCount } from "../learning/api";
import {
  type AdminAgentMemory,
  type AdminMemoryOverview,
  type AgentMemoryView,
  memoryApi,
  type RuleDraft,
  type StyleRule,
} from "./api";
import { usePostCallText } from "./strings";

type Tab = "my" | "company" | "agents";

const toDrafts = (items: readonly StyleRule[]): RuleDraft[] =>
  items.map(({ id, text, enabled }) => ({ id, text, enabled, _key: id }));

/** UI-016: Save is offered only when the rules differ from what is saved. */
const changed = (drafts: readonly RuleDraft[], saved: readonly StyleRule[]): boolean =>
  drafts.length !== saved.length ||
  drafts.some(
    (d, i) => d.id !== saved[i]?.id || d.text !== saved[i]?.text || d.enabled !== saved[i]?.enabled,
  );

export function StyleMemoryScreen() {
  const ft = usePostCallText();
  const ftRef = useRef(ft);
  ftRef.current = ft;
  const { locale } = useI18n();
  const cloud = useCloud();
  const isAdmin = cloud.status === "signed_in" && cloud.me.user.role === "admin";
  const [tab, setTab] = useState<Tab>(isAdmin ? "company" : "my");
  const [myView, setMyView] = useState<AgentMemoryView | null>(null);
  const [adminView, setAdminView] = useState<AdminMemoryOverview | null>(null);
  const [companyDrafts, setCompanyDrafts] = useState<RuleDraft[]>([]);
  const [agentDrafts, setAgentDrafts] = useState<Record<string, RuleDraft[]>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const syncAdmin = useCallback((ov: AdminMemoryOverview) => {
    setAdminView(ov);
    setCompanyDrafts(toDrafts(ov.company.items));
    const map: Record<string, RuleDraft[]> = {};
    for (const a of ov.agents) {
      map[a.user_id] = toDrafts(a.items);
    }
    setAgentDrafts(map);
  }, []);

  useEffect(() => {
    if (cloud.status !== "signed_in") return;
    const failed = () => {
      setLoadFailed(true);
      setNote(ftRef.current("memory.loadError"));
    };
    memoryApi.myMemory().then(setMyView, failed);
    if (isAdmin) memoryApi.adminOverview().then(syncAdmin, failed);
  }, [cloud.status, isAdmin, syncAdmin]);

  const runAdmin = useCallback(
    (
      promise: Promise<AdminMemoryOverview>,
      successKey: "memory.saved" | "memory.promoted" = "memory.saved",
    ) => {
      setBusy(true);
      setNote(null);
      promise
        .then((ov) => {
          syncAdmin(ov);
          setNote(ftRef.current(successKey));
          return memoryApi.myMemory().then(setMyView, () => {});
        })
        .catch(() => setNote(ftRef.current("memory.error")))
        .finally(() => setBusy(false));
    },
    [syncAdmin],
  );

  if (cloud.status !== "signed_in") {
    return <EmptyState testID="memory-signed-out" title={ft("memory.title")} />;
  }

  const limits = adminView?.limits ?? myView?.limits ?? { rules: 12, words: 25 };
  const dateOf = (ms: number) =>
    new Date(ms).toLocaleDateString(locale, { day: "numeric", month: "short" });

  const draftsValid = (list: RuleDraft[]) =>
    list.length <= limits.rules &&
    list.every((d) => {
      const n = wordCount(d.text);
      return n > 0 && n <= limits.words;
    });
  // UI-013: a tab whose data is on its way says so instead of leaving a blank page.
  const loading = !loadFailed && (tab === "my" ? myView === null : adminView === null);

  return (
    <Stack gap="lg" testID="style-memory-screen">
      <View style={styles.header}>
        <Text variant="heading" weight="semibold" accessibilityRole="header">
          {ft("memory.title")}
        </Text>
        <Text variant="body" tone="muted">
          {ft("memory.subtitle")}
        </Text>
      </View>

      {isAdmin ? (
        <SegmentedControl
          testID="memory-tabs"
          options={[
            { value: "company", label: ft("memory.companyTab") },
            { value: "agents", label: ft("memory.agentsTab") },
            { value: "my", label: ft("memory.myTab") },
          ]}
          value={tab}
          onChange={setTab}
          accessibilityLabel={ft("memory.title")}
        />
      ) : null}

      {note ? (
        <Text
          variant="label"
          tone="muted"
          accessibilityLiveRegion="polite"
          aria-live="polite"
          testID="memory-note"
        >
          {note}
        </Text>
      ) : null}

      {loading ? <LoadingLine label={ft("memory.loading")} testID="memory-loading" /> : null}
      {tab === "my" && myView ? (
        <Stack gap="md" testID="memory-my-view">
          <Panel>
            <Stack gap="sm">
              <Text variant="heading" weight="semibold">
                {ft("memory.effective", { count: myView?.effective.length ?? 0 })}
              </Text>
              {myView && myView.effective.length > 0 ? (
                myView.effective.map((rule) => (
                  <Text key={`eff:${rule}`} variant="body">
                    {`• ${rule}`}
                  </Text>
                ))
              ) : (
                <Text variant="body" tone="muted">
                  {ft("memory.empty")}
                </Text>
              )}
            </Stack>
          </Panel>
          {myView && myView.agent_rules.length > 0 ? (
            <Panel testID="memory-personal-readonly">
              <Stack gap="xs">
                <Text weight="semibold">{ft("memory.agentRules")}</Text>
                {myView.agent_rules.map((r) => (
                  <Text key={r.id} variant="label" tone={r.enabled ? "default" : "muted"}>
                    {r.enabled ? `• ${r.text}` : `• ${r.text} (${ft("memory.disabled")})`}
                  </Text>
                ))}
              </Stack>
            </Panel>
          ) : null}
          {myView && myView.pending.length > 0 ? (
            <Panel testID="memory-my-pending">
              <Stack gap="xs">
                {myView.pending.map((pv) => (
                  <Stack key={pv.version} gap="xs">
                    <Text weight="semibold">
                      {ft("memory.pendingTitle", { version: pv.version })}
                    </Text>
                    {pv.items.map((it) => (
                      <Text key={it.id} variant="label" tone="muted">
                        {`• ${it.text}`}
                      </Text>
                    ))}
                  </Stack>
                ))}
              </Stack>
            </Panel>
          ) : null}
          {myView && myView.company_rules.length > 0 ? (
            <Panel testID="memory-company-readonly">
              <Stack gap="xs">
                <Text weight="semibold">{ft("memory.companyTab")}</Text>
                {myView.company_rules.map((r) => (
                  <Text key={r.id} variant="label" tone={r.enabled ? "default" : "muted"}>
                    {r.enabled ? `• ${r.text}` : `• ${r.text} (${ft("memory.disabled")})`}
                  </Text>
                ))}
              </Stack>
            </Panel>
          ) : null}
        </Stack>
      ) : null}

      {isAdmin && tab === "company" && adminView ? (
        <Stack gap="md" testID="memory-admin-company">
          <Panel>
            <ToggleRow
              testID="memory-review-switch"
              label={ft("memory.reviewToggle")}
              description={ft("memory.reviewDesc")}
              value={adminView.review_before_apply}
              onValueChange={(on) => {
                if (!busy) runAdmin(memoryApi.setReview(on));
              }}
            />
          </Panel>

          <RuleEditorPanel
            testID="company-rules-editor"
            title={ft("memory.companyTab")}
            drafts={companyDrafts}
            onChange={setCompanyDrafts}
            limits={limits}
            busy={busy}
            valid={draftsValid(companyDrafts)}
            dirty={changed(companyDrafts, adminView.company.items)}
            onSave={() => runAdmin(memoryApi.editRules("company", null, companyDrafts))}
            versions={adminView.company.versions}
            dateOf={dateOf}
            onRevert={(v) => runAdmin(memoryApi.revert("company", null, v))}
          />
        </Stack>
      ) : null}

      {isAdmin && tab === "agents" && adminView?.agents.length === 0 ? (
        <EmptyState
          testID="memory-agents-empty"
          title={ft("memory.agentsEmpty")}
          body={ft("memory.agentsEmptyBody")}
        />
      ) : null}
      {isAdmin && tab === "agents" && adminView?.agents.length ? (
        <Stack gap="md" testID="memory-admin-agents">
          {adminView.agents.map((agent: AdminAgentMemory) => {
            const drafts = agentDrafts[agent.user_id] ?? [];
            const pendingVersions = agent.versions.filter((v) => v.status === "pending");
            return (
              <Panel key={agent.user_id} testID={`agent-memory-${agent.user_id}`}>
                <Stack gap="md">
                  <View style={styles.rowBetween}>
                    <View>
                      <Text variant="heading" weight="semibold">
                        {agent.name}
                      </Text>
                      <Text variant="label" tone="muted">
                        {`${agent.email} · ${agent.role}`}
                      </Text>
                    </View>
                    <Badge
                      label={ft("memory.agentActive", { count: agent.effective.length })}
                      tone="neutral"
                    />
                  </View>

                  {pendingVersions.map((pv) => (
                    <Panel
                      sunken
                      key={pv.version}
                      testID={`agent-pending-${agent.user_id}-${pv.version}`}
                    >
                      <Stack gap="sm">
                        <Text weight="semibold">
                          {ft("memory.pendingTitle", { version: pv.version })}
                        </Text>
                        {pv.items.map((it) => (
                          <Text key={it.id} variant="label">
                            {`• ${it.text}`}
                          </Text>
                        ))}
                        <View style={styles.row}>
                          <Button
                            testID={`approve-agent-${agent.user_id}-${pv.version}`}
                            label={ft("memory.approve")}
                            disabled={busy}
                            onPress={() =>
                              runAdmin(memoryApi.decide("agent", agent.user_id, pv.version, true))
                            }
                          />
                          <Button
                            testID={`reject-agent-${agent.user_id}-${pv.version}`}
                            variant="secondary"
                            label={ft("memory.reject")}
                            disabled={busy}
                            onPress={() =>
                              runAdmin(memoryApi.decide("agent", agent.user_id, pv.version, false))
                            }
                          />
                        </View>
                      </Stack>
                    </Panel>
                  ))}

                  {/* FUNC-008: the rules sit in the teammate's card, not in a second card. */}
                  <RuleEditorPanel
                    bare
                    testID={`agent-editor-${agent.user_id}`}
                    title={agent.name}
                    drafts={drafts}
                    onChange={(next) =>
                      setAgentDrafts((prev) => ({ ...prev, [agent.user_id]: next }))
                    }
                    limits={limits}
                    busy={busy}
                    valid={draftsValid(drafts)}
                    dirty={changed(drafts, agent.items)}
                    onSave={() => runAdmin(memoryApi.editRules("agent", agent.user_id, drafts))}
                    onPromote={(ruleId) =>
                      runAdmin(memoryApi.promote(agent.user_id, ruleId), "memory.promoted")
                    }
                    versions={agent.versions}
                    dateOf={dateOf}
                    onRevert={(v) => runAdmin(memoryApi.revert("agent", agent.user_id, v))}
                  />
                </Stack>
              </Panel>
            );
          })}
        </Stack>
      ) : null}
    </Stack>
  );
}

function RuleEditorPanel({
  testID,
  title,
  bare = false,
  drafts,
  onChange,
  limits,
  busy,
  valid,
  dirty,
  onSave,
  onPromote,
  versions,
  dateOf,
  onRevert,
}: {
  testID: string;
  title: string;
  /** Inside a card that already names whose rules these are: no card or title of its own. */
  bare?: boolean;
  drafts: RuleDraft[];
  onChange: (next: RuleDraft[]) => void;
  limits: { rules: number; words: number };
  busy: boolean;
  valid: boolean;
  /** The rules differ from the saved ones (UI-016: nothing to save, Save is off). */
  dirty: boolean;
  onSave: () => void;
  onPromote?: (ruleId: string) => void;
  versions: AdminMemoryOverview["company"]["versions"];
  dateOf: (ms: number) => string;
  onRevert: (version: number) => void;
}) {
  const ft = usePostCallText();
  const { color } = useTheme();
  const nextLocalId = useRef(1);
  const anyOver = drafts.some((d) => wordCount(d.text) > limits.words);
  const count = (
    <Text variant="label" tone="muted" testID={`${testID}-count`}>
      {`${drafts.length}/${limits.rules}`}
    </Text>
  );
  const body = (
    <Stack gap="md" testID={bare ? testID : undefined}>
      {bare ? null : (
        <View style={styles.rowBetween}>
          <Text weight="semibold">{title}</Text>
          {count}
        </View>
      )}

      {drafts.length === 0 ? (
        <Text variant="label" tone="muted">
          {ft("memory.empty")}
        </Text>
      ) : null}

      {drafts.map((rule, idx) => {
        const rid = rule.id;
        const words = wordCount(rule.text);
        const over = words > limits.words;
        const rowKey = rule._key ?? rid ?? `draft-${idx}`;
        return (
          <View key={rowKey} style={styles.ruleRow}>
            <View style={styles.grow}>
              <TextField
                label={`${idx + 1}.`}
                placeholder={ft("memory.rulePlaceholder")}
                value={rule.text}
                onChangeText={(text) =>
                  onChange(drafts.map((d, j) => (j === idx ? { ...d, text } : d)))
                }
              />
              {words > Math.floor(limits.words * 0.7) ? (
                <Text variant="label" tone={over ? "danger" : "muted"}>
                  {ft("memory.words", { count: words, max: limits.words })}
                </Text>
              ) : null}
            </View>
            <View style={styles.ruleActions}>
              <Switch
                accessibilityLabel={rule.enabled ? ft("memory.enabled") : ft("memory.disabled")}
                value={rule.enabled}
                disabled={busy}
                trackColor={{ false: color.borderStrong, true: color.primary }}
                thumbColor={color.surface}
                onValueChange={(enabled) =>
                  onChange(drafts.map((d, j) => (j === idx ? { ...d, enabled } : d)))
                }
              />
              {onPromote && rid ? (
                <Button
                  testID={`promote-${rid}`}
                  variant="ghost"
                  label={ft("memory.promote")}
                  disabled={busy}
                  onPress={() => onPromote(rid)}
                />
              ) : null}
              <Button
                variant="ghost"
                label={ft("memory.remove")}
                disabled={busy}
                onPress={() => onChange(drafts.filter((_, j) => j !== idx))}
              />
            </View>
          </View>
        );
      })}

      {anyOver ? (
        <Text variant="label" tone="danger" testID={`${testID}-words-over`}>
          {ft("memory.wordsOver", { max: limits.words })}
        </Text>
      ) : null}

      <View style={styles.row}>
        {drafts.length < limits.rules ? (
          <Button
            variant="outline"
            label={ft("memory.addRule")}
            disabled={busy}
            onPress={() => {
              const k = `new-${nextLocalId.current++}`;
              onChange([...drafts, { text: "", enabled: true, _key: k }]);
            }}
          />
        ) : null}
        <Button
          testID={`${testID}-save`}
          label={ft("memory.edit")}
          disabled={busy || !valid || !dirty}
          onPress={onSave}
        />
        {bare ? count : null}
      </View>

      {versions.length > 0 ? (
        <Stack gap="xs">
          <Text variant="label" weight="semibold" tone="muted">
            {ft("memory.versions")}
          </Text>
          {versions.slice(0, 5).map((v) => (
            <View key={v.version} style={styles.rowBetween}>
              <Text variant="label" tone="muted">
                {`v${v.version} · ${v.origin} · ${v.status} · ${dateOf(v.created_at)}`}
              </Text>
              {!v.active && v.status === "applied" ? (
                <Button
                  testID={`revert-${testID}-${v.version}`}
                  variant="ghost"
                  label={ft("memory.revert", { version: v.version })}
                  disabled={busy}
                  onPress={() => onRevert(v.version)}
                />
              ) : null}
            </View>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
  return bare ? body : <Panel testID={testID}>{body}</Panel>;
}

const styles = StyleSheet.create({
  header: { gap: space.xs },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm },
  rowBetween: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  ruleRow: { gap: space.xs },
  ruleActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm },
  grow: { flex: 1 },
});
