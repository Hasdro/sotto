/**
 * The connected user's upcoming Zoho meetings (owner request, 14 Nov 2026): the main way to get
 * call context. Soonest first, 20 a page ("Show more"); each opens a view-only detail
 * (participants, contact, description, place/link; the row itself already shows the time and the
 * related record, UX-004). The action button is the caller's: on the home screen "Use for my
 * next call", in the call rail "Use this meeting". Nothing is attached until it is pressed.
 */
import { Badge, Button, radius, Spinner, Stack, space, Text, useTheme } from "@sotto/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { CloudError } from "../../lib/cloud";
import type { StringKey } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";
import {
  type MeetingCandidate,
  type MeetingDetail,
  type MeetingPage,
  zohoMeetingDetail,
  zohoMeetings,
} from "./api";
import { onReturn } from "./useZoho";

export type MeetingAction = {
  /** Suffix of the button's test id (`meeting-<id>-<id>`); the rail's single action is "use". */
  id: string;
  label: string;
  onPress: (m: MeetingCandidate) => void;
  /** Some action is under way: the buttons wait. */
  busy?: boolean;
  /** UX-004: this button's own work for meeting `m` is under way: spinner and "Opening…". */
  working?: (m: MeetingCandidate) => boolean;
  variant?: "primary" | "secondary";
};

export type MeetingSource = {
  meetings: (page?: number) => Promise<MeetingPage>;
  detail: (id: string) => Promise<{ meeting: MeetingDetail }>;
};
const LIVE: MeetingSource = { meetings: zohoMeetings, detail: zohoMeetingDetail };

function problemOf(e: unknown): StringKey {
  if (e instanceof CloudError) {
    if (e.code === "zoho_reconnect") return "meetings.reconnect";
    if (e.code === "rate_limited") return "crm.limited";
  }
  return "meetings.error";
}

export function whenText(startIso: string, endIso: string, locale: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime())) return startIso;
  const day = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(start);
  const time = (d: Date) =>
    new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(d);
  return Number.isNaN(end.getTime())
    ? `${day} · ${time(start)}`
    : `${day} · ${time(start)}–${time(end)}`;
}

export function UpcomingMeetings({
  source = LIVE,
  action,
  actions,
  limit,
  onLoaded,
  testID = "upcoming-meetings",
}: {
  source?: MeetingSource;
  /** The button under an opened meeting; omitted = view only. */
  action?: { label: string; onPress: (m: MeetingCandidate) => void; busy?: boolean };
  /** Home (UX-03h): buttons shown on every row, open or not ("Prepare", "Start call…"). */
  actions?: readonly MeetingAction[];
  /** Show at most this many before "Show more" (the rail keeps it short). */
  limit?: number;
  /** The first page, soonest first, once it arrives (Home's "Next: … at …" line). */
  onLoaded?: (meetings: MeetingCandidate[]) => void;
  testID?: string;
}) {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<MeetingCandidate[] | null>(null);
  const [more, setMore] = useState(false);
  const [page, setPage] = useState(1);
  const [shown, setShown] = useState(limit ?? Number.POSITIVE_INFINITY);
  const [problem, setProblem] = useState<StringKey | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const loaded = useRef(onLoaded);
  loaded.current = onLoaded;

  const load = useCallback(
    (p: number) => {
      setLoading(true);
      setProblem(null);
      source
        .meetings(p)
        .then((r) => {
          setItems((old) => (p === 1 || !old ? r.meetings : [...old, ...r.meetings]));
          if (p === 1) loaded.current?.(r.meetings);
          setMore(r.more);
          setPage(r.page);
        })
        .catch((e: unknown) => {
          setProblem(problemOf(e));
          if (p === 1) setItems([]);
        })
        .finally(() => setLoading(false));
    },
    [source],
  );
  useEffect(() => {
    load(1);
    return onReturn(() => load(1)); // fresh when the person comes back to the app
  }, [load]);

  const visible = (items ?? []).slice(0, shown);
  const hidden = (items?.length ?? 0) > visible.length;
  return (
    <Stack gap="sm" testID={testID}>
      {loading && items === null ? (
        <Text variant="label" tone="muted" aria-live="polite" accessibilityLiveRegion="polite">
          {t("meetings.loading")}
        </Text>
      ) : null}
      {problem ? (
        <Stack gap="xs" align="flex-start">
          <Text variant="label" tone="muted" aria-live="polite" accessibilityLiveRegion="polite">
            {t(problem)}
          </Text>
          {problem === "meetings.error" ? (
            <Button variant="ghost" label={t("meetings.retry")} onPress={() => load(1)} />
          ) : null}
        </Stack>
      ) : null}
      {items && items.length === 0 && !problem ? (
        <Text variant="label" tone="muted" testID={`${testID}-empty`}>
          {t("meetings.empty")}
        </Text>
      ) : null}
      {visible.map((m) => (
        <MeetingRow
          key={m.id}
          meeting={m}
          open={open === m.id}
          onToggle={() => setOpen((o) => (o === m.id ? null : m.id))}
          source={source}
          action={action}
          actions={actions}
          locale={locale}
        />
      ))}
      {hidden || more ? (
        <Button
          variant="ghost"
          label={t("meetings.more")}
          disabled={loading}
          onPress={() => {
            if (hidden) setShown((n) => n + (limit ?? 20));
            else load(page + 1);
          }}
          testID={`${testID}-more`}
        />
      ) : null}
    </Stack>
  );
}

function MeetingRow({
  meeting: m,
  open,
  onToggle,
  source,
  action,
  actions,
  locale,
}: {
  meeting: MeetingCandidate;
  open: boolean;
  onToggle: () => void;
  source: MeetingSource;
  action?: { label: string; onPress: (m: MeetingCandidate) => void; busy?: boolean } | undefined;
  actions?: readonly MeetingAction[] | undefined;
  locale: string;
}) {
  const { t } = useI18n();
  const { color } = useTheme();
  return (
    <View style={[styles.row, { borderColor: color.border }]} testID={`meeting-${m.id}`}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        style={styles.head}
        testID={`meeting-${m.id}-toggle`}
      >
        <Text weight="semibold" numberOfLines={2}>
          {m.title || t("meetings.untitled")}
        </Text>
        <Text variant="label" tone="muted">
          {whenText(m.start, m.end, locale)}
        </Text>
        {m.related?.name ? (
          <Text variant="label" tone="muted" numberOfLines={1}>
            {`${t(`meetings.related.${m.related.module}` as StringKey)}: ${m.related.name}`}
          </Text>
        ) : null}
      </Pressable>
      {open ? <Detail id={m.id} source={source} /> : null}
      {open && action ? (
        <Button
          label={action.label}
          onPress={() => action.onPress(m)}
          disabled={action.busy}
          testID={`meeting-${m.id}-use`}
        />
      ) : null}
      {actions?.length ? (
        <View style={styles.actions}>
          {actions.map((a) => {
            const working = a.working?.(m) ?? false;
            return (
              <Button
                key={a.id}
                variant={a.variant ?? "secondary"}
                label={working ? t("meetings.opening") : a.label}
                accessibilityHint={m.title || t("meetings.untitled")}
                onPress={() => a.onPress(m)}
                busy={working}
                disabled={a.busy && !working}
                testID={`meeting-${m.id}-${a.id}`}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function Detail({ id, source }: { id: string; source: MeetingSource }) {
  const { t } = useI18n();
  const [d, setD] = useState<MeetingDetail | null>(null);
  const [problem, setProblem] = useState<StringKey | null>(null);
  useEffect(() => {
    source
      .detail(id)
      .then((r) => setD(r.meeting))
      .catch((e: unknown) => setProblem(problemOf(e)));
  }, [id, source]);
  if (problem)
    return (
      <Text variant="label" tone="muted">
        {t(problem)}
      </Text>
    );
  if (!d)
    return (
      <Stack direction="row" gap="xs" align="center">
        <Spinner />
        <Text variant="label" tone="muted" aria-live="polite" accessibilityLiveRegion="polite">
          {t("meetings.detailLoading")}
        </Text>
      </Stack>
    );
  // UX-004: the time and the related record are already in the row's header.
  return (
    <Stack gap="xs" testID={`meeting-${id}-detail`}>
      {d.contact?.name && d.contact.name !== d.related?.name ? (
        <Fact label={t("meetings.related.Contacts")} value={d.contact.name} />
      ) : null}
      {d.participants.length ? (
        <View>
          <Text variant="label" weight="semibold">
            {t("meetings.participants")}
          </Text>
          {d.participants.map((p) => (
            <Stack key={`${p.name}-${p.email}`} direction="row" gap="xs" align="center" wrap>
              <Text variant="label">{p.name || p.email}</Text>
              {p.email && p.name ? (
                <Text variant="label" tone="muted">
                  {p.email}
                </Text>
              ) : null}
              {p.type ? <Badge label={p.type} /> : null}
            </Stack>
          ))}
        </View>
      ) : null}
      {d.venue ? <Fact label={t("meetings.venue")} value={d.venue} /> : null}
      {d.link ? (
        <Button
          variant="ghost"
          label={t("meetings.join")}
          onPress={() => void Linking.openURL(d.link)}
          testID={`meeting-${id}-link`}
        />
      ) : null}
      {d.description ? <Fact label={t("meetings.description")} value={d.description} /> : null}
    </Stack>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text variant="label" weight="semibold">
        {label}
      </Text>
      <Text variant="label" tone="muted">
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderWidth: 1, borderRadius: radius.xl, padding: space.lg, gap: space.sm },
  head: { gap: 2 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
