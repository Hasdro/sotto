/**
 * Style Memory view (Round 4, A4): hosts both the Agent view (own rules + company rules +
 * effective list) and the Company Admin view (company roll-up, every agent's rules, edit,
 * disable, revert version history, approve/reject pending, promote agent rule to company-wide,
 * and "review before apply" switch). Every admin change is audit-logged server-side (R3).
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
} from "@sotto/ui";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Switch, View } from "react-native";
import { FeatureGate } from "../../components/FeatureGate";
import { wordCount } from "../../features/learning/api";
import {
  type AdminAgentMemory,
  type AdminMemoryOverview,
  type AgentMemoryView,
  memoryApi,
  type RuleDraft,
  SafeBoundary,
  type StyleRule,
  usePostCallText,
} from "../../features/postcall";
import { useI18n } from "../../lib/locale";
import { useCloud } from "../../lib/useCloud";

type Tab = "my" | "company" | "agents";

export default function StyleMemoryRoute() {
  return (
    <FeatureGate feature="style_memory">
      <SafeBoundary name="memory.view">
        <StyleMemoryScreen />
      </SafeBoundary>
    </FeatureGate>
  );
}

const toDrafts = (items: readonly StyleRule[]): RuleDraft[] =>
  items.map(({ id, text, enabled }) => ({ id, text, enabled }));

export function StyleMemoryScreen() {
  const ft = usePostCallText();
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
    memoryApi.myMemory().then(setMyView, () => setNote(ft("memory.error")));
    if (isAdmin) {
      memoryApi.adminOverview().then(syncAdmin, () => setNote(ft("memory.error")));
    }
  }, [cloud.status, isAdmin, syncAdmin, ft]);

  const runAdmin = useCallback(
    (promise: Promise<AdminMemoryOverview>, successKey: "memory.saved" | "memory.promoted" = "memory.saved") => {
      setBusy(true);
      setNote(null);
      promise
        .then((ov) => {
          syncAdmin(ov);
          setNote(ft(successKey));
          return memoryApi.myMemory().then(setMyView, () => {});
        })
        .catch(() => setNote(ft("memory.error")))
        .finally(() => setBusy(false));
    },
    [syncAdmin, ft],
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
        <Text variant="label" tone="muted" accessibilityLiveRegion="polite" aria-live="polite" testID="memory-note">
          {note}
        </Text>
      ) : null}

      {tab === "my" ? (
        <Stack gap="md" testID="memory-my-view">
          <Panel>
            <Stack gap="sm">
              <Text variant="heading" weight="semibold">
                {ft("memory.effective", { count: myView?.effective.length ?? 0 })}
              </Text>
              {myView && myView.effective.length > 0 ? (
                myView.effective.map((rule, idx) => (
                  <Text key={`${idx}:${rule}`} variant="body">
                    {`${idx + 1}. ${rule}`}
                  </Text>
                ))
              ) : (
                <Text variant="body" tone="muted">
                  {ft("memory.empty")}
                </Text>
              )}
            </Stack>
          </Panel>
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
              disabled={busy}
              onChange={(on) => runAdmin(memoryApi.setReview(on))}
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
            onSave={() => runAdmin(memoryApi.editRules("company", null, companyDrafts))}
            versions={adminView.company.versions}
            dateOf={dateOf}
            onRevert={(v) => runAdmin(memoryApi.revert("company", null, v))}
          />
        </Stack>
      ) : null}

      {isAdmin && tab === "agents" && adminView ? (
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
                      label={ft("memory.effective", { count: agent.effective.length })}
                      tone="neutral"
                    />
                  </View>

                  {pendingVersions.map((pv) => (
                    <Panel key={pv.version} testID={`agent-pending-${agent.user_id}-${pv.version}`}>
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

                  <RuleEditorPanel
                    testID={`agent-editor-${agent.user_id}`}
                    title={agent.name}
                    drafts={drafts}
                    onChange={(next) =>
                      setAgentDrafts((prev) => ({ ...prev, [agent.user_id]: next }))
                    }
                    limits={limits}
                    busy={busy}
                    valid={draftsValid(drafts)}
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
  drafts,
  onChange,
  limits,
  busy,
  valid,
  onSave,
  onPromote,
  versions,
  dateOf,
  onRevert,
}: {
  testID: string;
  title: string;
  drafts: RuleDraft[];
  onChange: (next: RuleDraft[]) => void;
  limits: { rules: number; words: number };
  busy: boolean;
  valid: boolean;
  onSave: () => void;
  onPromote?: (ruleId: string) => void;
  versions: AdminMemoryOverview["company"]["versions"];
  dateOf: (ms: number) => string;
  onRevert: (version: number) => void;
}) {
  const ft = usePostCallText();
  return (
    <Panel testID={testID}>
      <Stack gap="md">
        <View style={styles.rowBetween}>
          <Text weight="semibold">{title}</Text>
          <Text variant="label" tone="muted">
            {`${drafts.length}/${limits.rules}`}
          </Text>
        </View>

        {drafts.length === 0 ? (
          <Text variant="label" tone="muted">
            {ft("memory.empty")}
          </Text>
        ) : null}

        {drafts.map((rule, idx) => (
          <View key={rule.id ?? `new-${idx}`} style={styles.ruleRow}>
            <View style={styles.grow}>
              <TextField
                label={`${idx + 1}.`}
                placeholder={ft("memory.rulePlaceholder")}
                value={rule.text}
                onChangeText={(text) =>
                  onChange(drafts.map((d, j) => (j === idx ? { ...d, text } : d)))
                }
              />
            </View>
            <View style={styles.ruleActions}>
              <Switch
                accessibilityLabel={rule.enabled ? ft("memory.enabled") : ft("memory.disabled")}
                value={rule.enabled}
                onValueChange={(enabled) =>
                  onChange(drafts.map((d, j) => (j === idx ? { ...d, enabled } : d)))
                }
              />
              {onPromote && rule.id ? (
                <Button
                  testID={`promote-${rule.id}`}
                  variant="ghost"
                  label={ft("memory.promote")}
                  disabled={busy}
                  onPress={() => onPromote(rule.id!)}
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
        ))}

        <View style={styles.row}>
          {drafts.length < limits.rules ? (
            <Button
              variant="secondary"
              label={ft("memory.addRule")}
              disabled={busy}
              onPress={() => onChange([...drafts, { text: "", enabled: true }])}
            />
          ) : null}
          <Button
            testID={`${testID}-save`}
            label={ft("memory.edit")}
            disabled={busy || !valid}
            onPress={onSave}
          />
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
    </Panel>
  );
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
