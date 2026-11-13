/**
 * The live-call context rail (R10, T-056, T-057): find who is on the call in Zoho — today's
 * meetings first, or a search by phone, email or name — and let the agent pick one of at most
 * three candidates (each with its evidence) or skip. Nothing is attached without that pick.
 * Below it, the structured call brief the agent can edit (works without Zoho), and the
 * during-call quick actions (Lead, Contact update; collapsed). The attached record and the brief
 * reach the live prompt through the `crm_brief` prompt (features/crm/attached.ts).
 */
import { Badge, Button, Panel, SegmentedControl, Stack, space, Text, TextField } from "@sotto/ui";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { FeatureOff, useFeature } from "../../../components/FeatureGate";
import { CloudError } from "../../../lib/cloud";
import type { StringKey } from "../../../lib/i18n";
import { useI18n } from "../../../lib/locale";
import type { Perform } from "../../actions/ActionCard";
import { QuickActions } from "../../actions/PostCallPanel";
import {
  type Brief,
  type Candidate,
  type MeetingCandidate,
  zohoBrief,
  zohoMeetingBrief,
  zohoMeetings,
  zohoSearch,
} from "../../crm/api";
import {
  attachBrief,
  clearCrm,
  PREP_FIELDS,
  resetCall,
  setPrep,
  skipCrm,
  useAttachedState,
} from "../../crm/attached";
import { useZoho } from "../../crm/useZoho";
import { ZohoConnect } from "../../crm/ZohoConnect";

export type Lookup = {
  search: typeof zohoSearch;
  brief: typeof zohoBrief;
  meetings?: typeof zohoMeetings;
  meetingBrief?: typeof zohoMeetingBrief;
};

function errorKey(e: unknown): StringKey {
  if (e instanceof CloudError) {
    if (e.code === "zoho_reconnect") return "crm.reconnect";
    if (e.code === "rate_limited") return "crm.limited";
  }
  return "crm.error";
}

function timeOf(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

export function CrmRail({
  callId,
  lookup,
  perform,
}: {
  callId: string | null;
  lookup?: Lookup;
  perform?: Perform;
}) {
  // A new call starts with nothing attached and an empty brief.
  const lastCall = useRef(callId);
  useEffect(() => {
    if (lastCall.current !== callId) {
      lastCall.current = callId;
      resetCall();
    }
  }, [callId]);
  return (
    <Stack gap="md">
      <ZohoPart lookup={lookup} />
      <PrepPanel />
      <QuickActions perform={perform} />
    </Stack>
  );
}

function ZohoPart({ lookup }: { lookup?: Lookup | undefined }) {
  const effective = useFeature("zoho");
  const connectable = effective.state === "needs_connection" && effective.cause === "zoho";
  if (effective.state === "no_permission") return null;
  if (effective.state !== "available" && !connectable) {
    return <FeatureOff feature="zoho" effective={effective} />;
  }
  return connectable ? <ConnectFirst /> : <Finder lookup={lookup} />;
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

function Finder({ lookup }: { lookup?: Lookup | undefined }) {
  const { t, locale } = useI18n();
  const { crm: attached } = useAttachedState();
  const zoho = useZoho();
  const search = lookup?.search ?? zohoSearch;
  const fetchBrief = lookup?.brief ?? zohoBrief;
  const meetings = lookup?.meetings ?? zohoMeetings;
  const meetingBrief = lookup?.meetingBrief ?? zohoMeetingBrief;
  const [mode, setMode] = useState<"meetings" | "search">("meetings");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<"search" | "brief" | "meetings" | null>(null);
  const [found, setFound] = useState<Candidate[] | null>(null);
  const [today, setToday] = useState<MeetingCandidate[] | null>(null);
  const [error, setError] = useState<StringKey | null>(null);

  const showMeetings = mode === "meetings" && attached.kind === "none";
  // Loading the meeting list never blocks a search or a pick.
  const working = busy === "search" || busy === "brief";
  useEffect(() => {
    if (!showMeetings || today !== null) return;
    setBusy("meetings");
    meetings()
      .then((r) => setToday(r.candidates.slice(0, 3)))
      .catch((e: unknown) => {
        setToday([]);
        setError(errorKey(e));
      })
      .finally(() => setBusy(null));
  }, [showMeetings, today, meetings]);

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
  const attach = (p: Promise<{ brief: Brief }>) => {
    setBusy("brief");
    setError(null);
    p.then((r) => {
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
  const reconnect = zoho.status?.needs_reconnect ? (
    <Stack gap="xs" align="flex-start" testID="crm-reconnect">
      <Text variant="label" tone="muted">
        {t("crm.reconnect.body")}
      </Text>
      <Button variant="secondary" label={t("crm.reconnect.button")} onPress={zoho.connect} />
      {zoho.waiting ? (
        <Text variant="label" tone="muted" aria-live="polite" accessibilityLiveRegion="polite">
          {t("crm.connect.waiting")}
        </Text>
      ) : null}
    </Stack>
  ) : null;
  const notice = zoho.justConnected ? (
    <Text
      variant="label"
      tone="muted"
      aria-live="polite"
      accessibilityLiveRegion="polite"
      testID="crm-connected-now"
    >
      {t("crm.connected.now")}
    </Text>
  ) : null;

  if (attached.kind === "attached") {
    return (
      <Panel testID="crm-rail" sunken>
        <Stack gap="sm">
          {header}
          {notice}
          <BriefView brief={attached.brief} />
          <Text variant="label" tone="muted">
            {t("crm.attached")}
          </Text>
          <Button variant="ghost" label={t("crm.change")} onPress={clearCrm} testID="crm-change" />
          {reconnect}
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
        {notice}
        {reconnect}
        <SegmentedControl
          options={[
            { value: "meetings", label: t("crm.tab.meetings") },
            { value: "search", label: t("crm.tab.search") },
          ]}
          value={mode}
          onChange={setMode}
          accessibilityLabel={t("crm.tab.label")}
          testID="crm-mode"
        />
        {mode === "search" ? (
          <>
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
            <Button
              label={t("crm.find")}
              onPress={find}
              disabled={working || !query.trim()}
              testID="crm-find"
            />
          </>
        ) : null}
        <Button variant="ghost" label={t("crm.skip")} onPress={skipCrm} testID="crm-skip" />
        {busy ? (
          <Text variant="label" tone="muted" aria-live="polite" accessibilityLiveRegion="polite">
            {t(
              busy === "search"
                ? "crm.searching"
                : busy === "meetings"
                  ? "crm.meetings.loading"
                  : "crm.loading",
            )}
          </Text>
        ) : null}
        {error ? (
          <Text variant="label" tone="muted" aria-live="polite" accessibilityLiveRegion="polite">
            {t(error)}
          </Text>
        ) : null}
        {mode === "meetings" && today && today.length === 0 && !error ? (
          <Text variant="label" tone="muted" testID="crm-meetings-none">
            {t("crm.meetings.none")}
          </Text>
        ) : null}
        {mode === "meetings"
          ? today?.map((m) => (
              <View key={m.id} style={styles.candidate} testID={`crm-meeting-${m.id}`}>
                <Stack direction="row" gap="sm" align="center" wrap>
                  <Text weight="semibold">{m.title}</Text>
                  <Badge label={t("crm.meeting")} />
                </Stack>
                <Text variant="label" tone="muted">
                  {t("crm.meetings.at", { time: timeOf(m.start, locale) })}
                  {m.participants.length ? ` · ${m.participants.join(", ")}` : ""}
                </Text>
                <Button
                  variant="secondary"
                  label={t("crm.pickMeeting")}
                  onPress={() => attach(meetingBrief(m.id))}
                  disabled={working}
                  testID={`crm-pick-meeting-${m.id}`}
                />
              </View>
            ))
          : null}
        {mode === "search" && found && found.length === 0 ? (
          <Text variant="label" tone="muted" testID="crm-none">
            {t("crm.none")}
          </Text>
        ) : null}
        {mode === "search"
          ? found?.map((c) => (
              <View
                key={`${c.module}:${c.id}`}
                style={styles.candidate}
                testID={`crm-candidate-${c.id}`}
              >
                <Stack direction="row" gap="sm" align="center" wrap>
                  <Text weight="semibold">{c.name}</Text>
                  <Badge
                    label={t(c.module === "Leads" ? "crm.module.Leads" : "crm.module.Contacts")}
                  />
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
                  onPress={() => attach(fetchBrief(c))}
                  disabled={working}
                  testID={`crm-pick-${c.id}`}
                />
              </View>
            ))
          : null}
      </Stack>
    </Panel>
  );
}

/** The structured brief (T-056): editable, read by the AI, saved with the call. */
function PrepPanel() {
  const { t } = useI18n();
  const prep = useFeature("prep");
  const { prep: values } = useAttachedState();
  if (prep.state === "no_permission") return null;
  if (prep.state !== "available") return <FeatureOff feature="prep" effective={prep} />;
  return (
    <Panel testID="prep-brief" sunken>
      <Stack gap="sm">
        <Text variant="label" weight="semibold" tone="muted" accessibilityRole="header">
          {t("prep.title")}
        </Text>
        <Text variant="label" tone="muted">
          {t("prep.hint")}
        </Text>
        {PREP_FIELDS.map((f) => (
          <TextField
            key={f}
            label={t(`prep.${f}`)}
            value={values[f]}
            onChangeText={(v) => setPrep(f, v)}
            multiline={f === "tldr" || f === "pains"}
            height={f === "tldr" || f === "pains" ? 56 : undefined}
            testID={`prep-${f}`}
          />
        ))}
      </Stack>
    </Panel>
  );
}

export function BriefView({ brief }: { brief: Brief }) {
  const { t, locale } = useI18n();
  const p = brief.person;
  const m = brief.meeting;
  return (
    <Stack gap="sm" testID="crm-brief">
      {m ? (
        <View testID="crm-brief-meeting">
          <Text variant="label" weight="semibold">
            {`${t("crm.meeting")}: ${m.title}`}
          </Text>
          <Text variant="label" tone="muted">
            {[t("crm.meetings.at", { time: timeOf(m.start, locale) }), m.participants.join(", ")]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {m.agenda ? (
            <Text variant="label" tone="muted" numberOfLines={3}>
              {`${t("crm.agenda")}: ${m.agenda}`}
            </Text>
          ) : null}
        </View>
      ) : null}
      {p ? (
        <View>
          <Text weight="semibold">{p.name}</Text>
          <Text variant="label" tone="muted">
            {[p.title, p.email, p.phone].filter(Boolean).join(" · ")}
          </Text>
        </View>
      ) : null}
      {brief.account?.name ? (
        <Text variant="label">
          {`${t("crm.account")}: ${brief.account.name}${brief.account.industry ? ` (${brief.account.industry})` : ""}`}
        </Text>
      ) : null}
      {p?.module === "Contacts" ? (
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
      {p ? (
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
      ) : null}
    </Stack>
  );
}

const styles = StyleSheet.create({
  candidate: { gap: space.xs, paddingTop: space.sm },
});
