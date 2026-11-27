/**
 * The call's context rail (R10, T-056, T-057; UX-01, UX-03r, UX-16, UX-17, UX-19, T-075).
 *
 * Two states:
 * - **Before the call** (`stage="prepare"`): find who the call is with in Zoho — the person's own
 *   upcoming meetings first, a search by name, email or phone as the fallback (≤ 3 candidates
 *   with evidence) — or skip; nothing is attached without that pick. An unknown caller (the
 *   dedupe search found nobody) is offered a prefilled Lead, written only when the agent
 *   approves it (R12). Then the full brief editor.
 * - **Live** (`stage="live"`): a quiet, read-only 4-line brief (who, company, objective, next
 *   step) with an Edit link, Zoho details behind "More from Zoho", and — only when the call
 *   started unlinked — one line "Not linked to Zoho · Link". No CRM forms (R12 writes belong
 *   after the call).
 *
 * The attached record and the brief reach the live prompt through the `crm_brief` prompt
 * (features/crm/attached.ts) in both states.
 */
import {
  Badge,
  Button,
  Disclosure,
  Panel,
  Stack,
  space,
  Text,
  TextField,
  useTheme,
} from "@sotto/ui";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { FeatureOff, useFeature } from "../../../components/FeatureGate";
import { SafeBoundary } from "../../../components/SafeBoundary";
import { CloudError } from "../../../lib/cloud";
import { formatDay, formatMoney, formatWhen } from "../../../lib/format";
import type { StringKey } from "../../../lib/i18n";
import { useI18n } from "../../../lib/locale";
import { ActionCard, type Perform } from "../../actions/ActionCard";
import { type GamePlan, GamePlanCard, PrepCoachPanel } from "../../coach";
import { type Brief, type Candidate, zohoBrief, zohoMeetingBrief, zohoSearch } from "../../crm/api";
import {
  attachBrief,
  clearCrm,
  isPrefilled,
  PREP_FIELDS,
  setPrep,
  skipCrm,
  useAttachedState,
} from "../../crm/attached";
import { BlueprintChecklist } from "../../crm/BlueprintChecklist";
import { useCrmText } from "../../crm/strings";
import { type MeetingSource, UpcomingMeetings } from "../../crm/UpcomingMeetings";
import { useZoho } from "../../crm/useZoho";
import { ZohoConnect } from "../../crm/ZohoConnect";
import { useCallText } from "../strings";
import { CallStatePanel } from "./CallStatePanel";

export type Lookup = {
  search: typeof zohoSearch;
  brief: typeof zohoBrief;
  meetings?: MeetingSource;
  meetingBrief?: typeof zohoMeetingBrief;
};
export type RailStage = "prepare" | "live";

function errorKey(e: unknown): StringKey {
  if (e instanceof CloudError) {
    if (e.code === "zoho_reconnect") return "crm.reconnect";
    if (e.code === "rate_limited") return "crm.limited";
  }
  return "crm.error";
}

export function CrmRail({
  lookup,
  perform,
  stage = "prepare",
  callId,
  callState = null,
}: {
  lookup?: Lookup;
  perform?: Perform;
  stage?: RailStage;
  callId?: string;
  callState?: string | null;
}) {
  const [fallbackId] = useState(
    () => `prep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
  );
  const activeCallId = callId || fallbackId;
  const [gamePlan, setGamePlan] = useState<GamePlan | null>(null);
  return stage === "live" ? (
    <SafeBoundary name="rail.live">
      <LiveRail lookup={lookup} gamePlan={gamePlan} callState={callState} />
    </SafeBoundary>
  ) : (
    <SafeBoundary name="rail.prepare">
      <Stack gap="md">
        <ZohoPart lookup={lookup} perform={perform} />
        <PrepPanel />
        <PrepCoachPanel callId={activeCallId} onGamePlanChange={setGamePlan} />
      </Stack>
    </SafeBoundary>
  );
}

// ---------------------------------------------------------------------------------------------
// Live: read-only

function LiveRail({
  lookup,
  gamePlan,
  callState,
}: {
  lookup?: Lookup | undefined;
  gamePlan: GamePlan | null;
  callState: string | null;
}) {
  const tc = useCallText();
  const zoho = useFeature("zoho");
  const { crm } = useAttachedState();
  const [editing, setEditing] = useState(false);
  const [linking, setLinking] = useState(false);
  const zohoOn = zoho.state === "available";
  const linked = crm.kind === "attached";
  return (
    <Stack gap="md" testID="crm-rail-live">
      {zohoOn && !linked ? (
        linking ? (
          <Finder lookup={lookup} onDone={() => setLinking(false)} />
        ) : (
          <NotLinked onLink={() => setLinking(true)} />
        )
      ) : null}
      {editing ? (
        <PrepPanel onDone={() => setEditing(false)} />
      ) : (
        <LiveBrief onEdit={() => setEditing(true)} />
      )}
      <CallStatePanel state={callState} />
      <GamePlanCard plan={gamePlan} />
      {linked ? (
        <Disclosure title={tc("rail.more")} testID="crm-more">
          <BriefView brief={crm.brief} />
        </Disclosure>
      ) : null}
    </Stack>
  );
}

/** UX-03r: the only Zoho line of a call that started unlinked. */
function NotLinked({ onLink }: { onLink: () => void }) {
  const tc = useCallText();
  const { color } = useTheme();
  return (
    <View style={styles.inline} testID="crm-not-linked">
      <Text variant="label" tone="muted">
        {`${tc("rail.notLinked")} · `}
      </Text>
      <Pressable accessibilityRole="button" onPress={onLink} testID="crm-link" hitSlop={8}>
        <Text variant="label" weight="semibold" color={color.primary}>
          {tc("rail.link")}
        </Text>
      </Pressable>
    </View>
  );
}

/** The 4 lines an agent can read in a glance: who, company, objective, next step. */
export function briefLines(
  state: ReturnType<typeof useAttachedState>,
): { key: "who" | "company" | "objective" | "next"; value: string }[] {
  const brief = state.crm.kind === "attached" ? state.crm.brief : null;
  const p = brief?.person;
  const who = p ? [p.name, p.title].filter(Boolean).join(", ") : state.prep.attendees.trim();
  const company = brief?.account?.name ?? "";
  const lines = [
    { key: "who" as const, value: who },
    { key: "company" as const, value: company },
    { key: "objective" as const, value: state.prep.objective.trim() || state.prep.tldr.trim() },
    { key: "next" as const, value: state.prep.next_step.trim() },
  ];
  return lines.filter((l) => l.value);
}

function LiveBrief({ onEdit }: { onEdit: () => void }) {
  const tc = useCallText();
  const { color } = useTheme();
  const state = useAttachedState();
  const prep = useFeature("prep");
  if (prep.state === "no_permission") return null;
  const lines = briefLines(state);
  const editable = prep.state === "available";
  return (
    <Panel sunken testID="live-brief">
      <Stack gap="xs">
        <View style={styles.headRow}>
          <Text variant="label" weight="semibold" tone="muted" accessibilityRole="header">
            {tc("rail.brief")}
          </Text>
          {editable ? (
            <Pressable accessibilityRole="button" onPress={onEdit} testID="brief-edit" hitSlop={8}>
              <Text variant="label" weight="semibold" color={color.primary}>
                {tc("ui.edit")}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {state.crm.kind === "attached" ? (
          <Text variant="label" tone="muted" testID="crm-linked">
            {tc("rail.linked")}
          </Text>
        ) : null}
        {lines.length ? (
          lines.map((l) => (
            <Text key={l.key} variant="body" numberOfLines={1} testID={`brief-line-${l.key}`}>
              <Text variant="body" tone="muted">{`${tc(`rail.${l.key}`)}: `}</Text>
              {l.value}
            </Text>
          ))
        ) : (
          <Text variant="label" tone="muted" testID="brief-empty">
            {tc("rail.empty")}
          </Text>
        )}
      </Stack>
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------
// Before the call: Zoho pick and the brief editor

function ZohoPart({ lookup, perform }: { lookup?: Lookup | undefined; perform?: Perform }) {
  const effective = useFeature("zoho");
  const connectable = effective.state === "needs_connection" && effective.cause === "zoho";
  if (effective.state === "no_permission") return null;
  if (effective.state !== "available" && !connectable) {
    return <FeatureOff feature="zoho" effective={effective} />;
  }
  return connectable ? <ConnectFirst /> : <Finder lookup={lookup} perform={perform} />;
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

function Finder({
  lookup,
  perform,
  onDone,
}: {
  lookup?: Lookup | undefined;
  perform?: Perform | undefined;
  /** Live "Link": close the finder once a record is attached. */
  onDone?: () => void;
}) {
  const { t } = useI18n();
  const tc = useCallText();
  const { crm: attached } = useAttachedState();
  const zoho = useZoho();
  const search = lookup?.search ?? zohoSearch;
  const fetchBrief = lookup?.brief ?? zohoBrief;
  const meetingBrief = lookup?.meetingBrief ?? zohoMeetingBrief;
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const [busy, setBusy] = useState<"search" | "brief" | null>(null);
  const [found, setFound] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<StringKey | null>(null);

  const find = () => {
    if (!query.trim()) return;
    setBusy("search");
    setError(null);
    setFound(null);
    const q = query.trim();
    search(q)
      .then((r) => {
        setFound(r.candidates.slice(0, 3));
        setSearched(q);
      })
      .catch((e: unknown) => setError(errorKey(e)))
      .finally(() => setBusy(null));
  };
  const attach = (p: Promise<{ brief: Brief }>) => {
    setBusy("brief");
    setError(null);
    p.then((r) => {
      attachBrief(r.brief);
      setFound(null);
      onDone?.();
    })
      .catch((e: unknown) => setError(errorKey(e)))
      .finally(() => setBusy(null));
  };
  const working = busy !== null;

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
      <Button variant="outline" label={t("crm.reconnect.button")} onPress={zoho.connect} />
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
          <Text variant="label" tone="muted" testID="crm-linked">
            {tc("rail.linked")}
          </Text>
          <Button variant="ghost" label={t("crm.change")} onPress={clearCrm} testID="crm-change" />
          {reconnect}
        </Stack>
      </Panel>
    );
  }
  if (attached.kind === "skipped" && !onDone) {
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
  const unknown = found !== null && found.length === 0 && !onDone;
  return (
    <Panel testID="crm-rail" sunken>
      <Stack gap="sm">
        {header}
        {notice}
        {reconnect}
        {/* Main path (owner, 14 Nov): this person's upcoming meetings. */}
        <Text variant="label" weight="semibold">
          {t("meetings.title")}
        </Text>
        <UpcomingMeetings
          source={lookup?.meetings}
          limit={3}
          testID="crm-meetings"
          action={{
            label: t("meetings.useNow"),
            busy: working,
            onPress: (m) => attach(meetingBrief(m.id)),
          }}
        />
        {/* Fallback: search by name, email or phone (also the dedupe check for a new caller). */}
        <Text variant="label" tone="muted">
          {t("meetings.notListed")}
        </Text>
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
            variant="outline"
            label={t("crm.find")}
            onPress={find}
            disabled={working || !query.trim()}
            testID="crm-find"
          />
          <Button
            variant="ghost"
            label={t("crm.skip")}
            onPress={() => {
              skipCrm();
              onDone?.();
            }}
            testID="crm-skip"
          />
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
        {unknown ? (
          <NewLeadOffer
            query={searched}
            perform={perform}
            onSaved={(id) => attach(fetchBrief({ module: "Leads", id }))}
          />
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
              variant="outline"
              label={t("crm.pickNamed", { name: c.name })}
              onPress={() => attach(fetchBrief(c))}
              disabled={working}
              testID={`crm-pick-${c.id}`}
            />
          </View>
        ))}
      </Stack>
    </Panel>
  );
}

/** The searched text as Lead fields: an email, a phone, or a name split in two. Pure. */
export function leadFromQuery(q: string): Record<string, string> {
  const s = q.trim();
  if (/^\S+@\S+\.\S+$/.test(s)) return { email: s };
  if (/^\+?[\d\s().-]{6,}$/.test(s)) return { phone: s };
  const [first, ...rest] = s.split(/\s+/);
  return rest.length ? { first_name: first ?? "", last_name: rest.join(" ") } : { last_name: s };
}

/** UX-19 / INT-11: an unknown caller, before the call. Written only on approval (R12). */
function NewLeadOffer({
  query,
  perform,
  onSaved,
}: {
  query: string;
  perform?: Perform | undefined;
  onSaved: (id: string) => void;
}) {
  const { t } = useI18n();
  const tc = useCallText();
  return (
    <Stack gap="sm" testID="lead-offer">
      <Text variant="label" weight="semibold">
        {tc("lead.offer.title")}
      </Text>
      <Text variant="label" tone="muted">
        {tc("lead.offer.body")}
      </Text>
      <ActionCard
        key={query}
        kind="lead"
        title={t("actions.lead")}
        perform={perform}
        specs={[
          { name: "first_name", label: "actions.field.first_name" },
          { name: "last_name", label: "actions.field.last_name" },
          { name: "company", label: "actions.field.company" },
          { name: "email", label: "actions.field.email" },
          { name: "phone", label: "actions.field.phone" },
        ]}
        initial={leadFromQuery(query)}
        build={(v) =>
          Object.fromEntries(
            ["first_name", "last_name", "company", "email", "phone"]
              .map((k) => [k, (v[k] ?? "").trim()])
              .filter(([, x]) => x),
          )
        }
        onSaved={onSaved}
      />
    </Stack>
  );
}

/** The structured brief (T-056): editable, read by the AI, saved with the call. */
function PrepPanel({ onDone }: { onDone?: () => void }) {
  const { t } = useI18n();
  const tc = useCallText();
  const prep = useFeature("prep");
  const attached = useAttachedState();
  const values = attached.prep;
  if (prep.state === "no_permission") return null;
  if (prep.state !== "available") return <FeatureOff feature="prep" effective={prep} />;
  return (
    <Panel testID="prep-brief" sunken>
      <Stack gap="sm">
        <Text variant="label" weight="semibold" tone="muted" accessibilityRole="header">
          {t("prep.title")}
        </Text>
        <Text variant="label" tone="muted" testID="prep-help">
          {tc("prep.help")}
        </Text>
        {PREP_FIELDS.map((f) => {
          // UX-006: a field Zoho filled in says so until the agent changes it.
          const prefilled = isPrefilled(attached, f);
          return (
            <View key={f} style={styles.field}>
              <TextField
                label={t(`prep.${f}`)}
                value={values[f]}
                onChangeText={(v) => setPrep(f, v)}
                multiline={f === "tldr" || f === "pains"}
                height={f === "tldr" || f === "pains" ? 56 : undefined}
                {...(prefilled ? { accessibilityHint: tc("prep.prefilled") } : {})}
                testID={`prep-${f}`}
              />
              {prefilled ? (
                <Text variant="label" tone="muted" testID={`prep-${f}-prefilled`}>
                  {tc("prep.prefilled")}
                </Text>
              ) : null}
            </View>
          );
        })}
        {onDone ? (
          <Button variant="outline" label={tc("rail.done")} onPress={onDone} testID="prep-done" />
        ) : null}
      </Stack>
    </Panel>
  );
}

/** One deal as a line: "Acme renewal 2027 · Negotiation · AED 12,000 · closes 1 Dec" (UX-17). */
export function dealLine(
  d: Brief["deals"][number],
  locale: "en" | "ar",
  closes: (date: string) => string,
  now?: Date,
): string {
  return [
    d.name,
    d.stage,
    formatMoney(d.amount, d.currency, locale),
    d.close_date ? closes(formatDay(d.close_date, locale, now)) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function BriefView({ brief }: { brief: Brief }) {
  const { t, locale } = useI18n();
  const tc = useCallText();
  const ct = useCrmText();
  const p = brief.person;
  const camp = p?.campaign_info;
  const firstDeal = brief.deals.find((d) => d.id);
  const m = brief.meeting;
  return (
    <Stack gap="sm" testID="crm-brief">
      {m ? (
        <View testID="crm-brief-meeting">
          <Text variant="label" weight="semibold">
            {`${t("crm.meeting")}: ${m.title}`}
          </Text>
          <Text variant="label" tone="muted">
            {[formatWhen(m.start, locale), m.participants.join(", ")].filter(Boolean).join(" · ")}
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
          {camp?.name ? (
            <Text variant="label" tone="muted" testID="crm-campaign">
              {ct("campaign.line", {
                name: [camp.name, [camp.type, camp.status].filter(Boolean).join(", ")]
                  .filter(Boolean)
                  .join(" · "),
              })}
            </Text>
          ) : null}
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
              <Text
                key={`${d.name}-${d.close_date}`}
                variant="label"
                tone="muted"
                testID="crm-deal"
              >
                {dealLine(d, locale, (date) => tc("rail.closes", { date }))}
              </Text>
            ))
          ) : (
            <Text variant="label" tone="muted">
              {t("crm.none.deals")}
            </Text>
          )}
        </View>
      ) : null}
      {firstDeal ? <BlueprintChecklist dealId={firstDeal.id} /> : null}
      {p ? (
        <View>
          <Text variant="label" weight="semibold">
            {t("crm.notes")}
          </Text>
          {brief.notes.length ? (
            brief.notes.map((n) => (
              <Text
                key={`${n.date}-${n.title}`}
                variant="label"
                tone="muted"
                numberOfLines={3}
                testID="crm-note"
              >
                {`${formatDay(n.date, locale)} · ${n.title ? `${n.title}: ` : ""}${n.text}`}
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
  field: { gap: space.xs },
  inline: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
