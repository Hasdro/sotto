/**
 * Zoho in the live-call context rail (R10, T-057): find who is on the call, let the agent pick
 * one of at most three candidates (each with the field that matched), or skip. Nothing is ever
 * attached without that pick. The attached record's short brief is shown here and goes to the
 * live prompt through the `crm_brief` prompt (features/crm/attached.ts).
 */
import { Badge, Button, Panel, Stack, space, Text, TextField } from "@sotto/ui";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { FeatureOff, useFeature } from "../../../components/FeatureGate";
import { CloudError } from "../../../lib/cloud";
import type { StringKey } from "../../../lib/i18n";
import { useI18n } from "../../../lib/locale";
import { type Brief, type Candidate, zohoBrief, zohoSearch } from "../../crm/api";
import { attachBrief, clearCrm, skipCrm, useAttached } from "../../crm/attached";
import { useZoho } from "../../crm/useZoho";
import { ZohoConnect } from "../../crm/ZohoConnect";

type Lookup = {
  search: typeof zohoSearch;
  brief: typeof zohoBrief;
};

function errorKey(e: unknown): StringKey {
  if (e instanceof CloudError) {
    if (e.code === "zoho_reconnect") return "crm.reconnect";
    if (e.code === "rate_limited") return "crm.limited";
  }
  return "crm.error";
}

export function CrmRail({ callId, lookup }: { callId: string | null; lookup?: Lookup }) {
  const effective = useFeature("zoho");
  const connectable = effective.state === "needs_connection" && effective.cause === "zoho";
  if (effective.state === "no_permission") return null;
  if (effective.state !== "available" && !connectable) {
    return <FeatureOff feature="zoho" effective={effective} />;
  }
  return connectable ? <ConnectFirst /> : <Finder callId={callId} lookup={lookup} />;
}

function ConnectFirst() {
  const { t } = useI18n();
  const zoho = useZoho();
  return (
    <Panel testID="crm-rail" sunken>
      <Stack gap="sm">
        <Text variant="label" weight="semibold" tone="muted" accessibilityRole="header">
          {t("crm.title")}
        </Text>
        <ZohoConnect zoho={zoho} compact />
      </Stack>
    </Panel>
  );
}

function Finder({ callId, lookup }: { callId: string | null; lookup?: Lookup }) {
  const { t } = useI18n();
  const attached = useAttached();
  const search = lookup?.search ?? zohoSearch;
  const fetchBrief = lookup?.brief ?? zohoBrief;
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<"search" | "brief" | null>(null);
  const [found, setFound] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<StringKey | null>(null);
  // A new call starts with nothing attached.
  const lastCall = useRef(callId);
  useEffect(() => {
    if (lastCall.current !== callId) {
      lastCall.current = callId;
      clearCrm();
      setFound(null);
    }
  }, [callId]);

  const find = () => {
    if (!query.trim()) return;
    setBusy("search");
    setError(null);
    setFound(null);
    search(query.trim())
      .then((r) => setFound(r.candidates.slice(0, 3)))
      .catch((e: unknown) => setError(errorKey(e)))
      .finally(() => setBusy(null));
  };
  const pick = (c: Candidate) => {
    setBusy("brief");
    setError(null);
    fetchBrief(c)
      .then((r) => {
        attachBrief(r.brief);
        setFound(null);
      })
      .catch((e: unknown) => setError(errorKey(e)))
      .finally(() => setBusy(null));
  };

  const header = (
    <Text variant="label" weight="semibold" tone="muted" accessibilityRole="header">
      {t("crm.title")}
    </Text>
  );

  if (attached.kind === "attached") {
    return (
      <Panel testID="crm-rail" sunken>
        <Stack gap="sm">
          {header}
          <BriefView brief={attached.brief} />
          <Text variant="label" tone="muted">
            {t("crm.attached")}
          </Text>
          <Button variant="ghost" label={t("crm.change")} onPress={clearCrm} testID="crm-change" />
        </Stack>
      </Panel>
    );
  }
  if (attached.kind === "skipped") {
    return (
      <Panel testID="crm-rail" sunken>
        <Stack gap="sm">
          {header}
          <Text variant="body" tone="muted">
            {t("crm.skipped")}
          </Text>
          <Button variant="ghost" label={t("crm.find")} onPress={clearCrm} testID="crm-change" />
        </Stack>
      </Panel>
    );
  }
  return (
    <Panel testID="crm-rail" sunken>
      <Stack gap="sm">
        {header}
        <TextField
          label={t("crm.search.label")}
          placeholder={t("crm.search.placeholder")}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={find}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          testID="crm-query"
        />
        <Stack direction="row" gap="sm" wrap>
          <Button
            label={t("crm.find")}
            onPress={find}
            disabled={busy !== null || !query.trim()}
            testID="crm-find"
          />
          <Button variant="ghost" label={t("crm.skip")} onPress={skipCrm} testID="crm-skip" />
        </Stack>
        {busy ? (
          <Text variant="label" tone="muted" aria-live="polite" accessibilityLiveRegion="polite">
            {t(busy === "search" ? "crm.searching" : "crm.loading")}
          </Text>
        ) : null}
        {error ? (
          <Text variant="label" tone="muted" aria-live="polite" accessibilityLiveRegion="polite">
            {t(error)}
          </Text>
        ) : null}
        {found && found.length === 0 ? (
          <Text variant="label" tone="muted" testID="crm-none">
            {t("crm.none")}
          </Text>
        ) : null}
        {found?.map((c) => (
          <View
            key={`${c.module}:${c.id}`}
            style={styles.candidate}
            testID={`crm-candidate-${c.id}`}
          >
            <Stack direction="row" gap="sm" align="center" wrap>
              <Text weight="semibold">{c.name}</Text>
              <Badge label={t(c.module === "Leads" ? "crm.module.Leads" : "crm.module.Contacts")} />
            </Stack>
            {c.title || c.company ? (
              <Text variant="label" tone="muted">
                {[c.title, c.company].filter(Boolean).join(" · ")}
              </Text>
            ) : null}
            <Text variant="label" tone="muted">
              {t("crm.matched", {
                field: t(`crm.field.${c.evidence.field}` as StringKey),
                value: c.evidence.value,
              })}
            </Text>
            <Button
              variant="secondary"
              label={t("crm.pickNamed", { name: c.name })}
              onPress={() => pick(c)}
              disabled={busy !== null}
              testID={`crm-pick-${c.id}`}
            />
          </View>
        ))}
      </Stack>
    </Panel>
  );
}

export function BriefView({ brief }: { brief: Brief }) {
  const { t } = useI18n();
  const p = brief.person;
  return (
    <Stack gap="sm" testID="crm-brief">
      <View>
        <Text weight="semibold">{p.name}</Text>
        <Text variant="label" tone="muted">
          {[p.title, p.email, p.phone].filter(Boolean).join(" · ")}
        </Text>
      </View>
      {brief.account?.name ? (
        <Text variant="label">
          {`${t("crm.account")}: ${brief.account.name}${brief.account.industry ? ` (${brief.account.industry})` : ""}`}
        </Text>
      ) : null}
      {p.module === "Contacts" ? (
        <View>
          <Text variant="label" weight="semibold">
            {t("crm.deals")}
          </Text>
          {brief.deals.length ? (
            brief.deals.map((d) => (
              <Text key={`${d.name}-${d.close_date}`} variant="label" tone="muted">
                {[d.name, d.stage, d.amount, d.close_date].filter(Boolean).join(" · ")}
              </Text>
            ))
          ) : (
            <Text variant="label" tone="muted">
              {t("crm.none.deals")}
            </Text>
          )}
        </View>
      ) : null}
      <View>
        <Text variant="label" weight="semibold">
          {t("crm.notes")}
        </Text>
        {brief.notes.length ? (
          brief.notes.map((n) => (
            <Text key={`${n.date}-${n.title}`} variant="label" tone="muted" numberOfLines={3}>
              {`${n.date} · ${n.title ? `${n.title}: ` : ""}${n.text}`}
            </Text>
          ))
        ) : (
          <Text variant="label" tone="muted">
            {t("crm.none.notes")}
          </Text>
        )}
      </View>
    </Stack>
  );
}

const styles = StyleSheet.create({
  candidate: { gap: space.xs, paddingTop: space.sm },
});
