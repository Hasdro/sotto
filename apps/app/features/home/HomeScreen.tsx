/**
 * Home (owner, 21 Oct; UX-10, UX-25, UX-26, UX-43b): what is next for me. The next meeting in
 * the title, the first-run steps until they are done, today's numbers, the next meetings with
 * Prepare / Start, the last call's tip and recent calls. Agents also see the questions they
 * sent to their manager; admins and managers see the company line and the playbook instead.
 * Agents never see model names or company stats (draft D-050 (backlog)).
 * UX-003: `today` (Morning brief, pending call reviews) sits above Recent calls: at the top of
 * the side column on wide windows, right under the numbers on narrow ones.
 */

import {
  Badge,
  Button,
  Icon,
  radius,
  StatTile,
  space,
  Text,
  useDirection,
  useTheme,
} from "@sotto/ui";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { AppLink } from "../../components/AppLink";
import { allDeviceCalls, type DeviceCall, deviceCalls } from "../../lib/deviceHistory";
import { daysFromToday, formatTime, formatWeekday } from "../../lib/format";
import type { Locale } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";
import { useRole } from "../../lib/role";
import { useCloud } from "../../lib/useCloud";
import type { MeetingCandidate } from "../crm/api";
import { HomeMeetings } from "../crm/HomeMeetings";
import { useOpenCount } from "../escalations/store";
import { DueSteps } from "../followup";
import { SetupChecklist } from "./SetupChecklist";

const DAY_MS = 86_400_000;

export function startOfToday(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Today's numbers from the calls kept on this device. */
export function todayStats(calls: ReturnType<typeof deviceCalls>, now = Date.now()) {
  const today = calls.filter((c) => c.started_at >= startOfToday(now));
  const minutes = today.reduce(
    (sum, c) => sum + Math.max(0, ((c.ended_at ?? c.started_at) - c.started_at) / 60_000),
    0,
  );
  const speeds = today.map((c) => c.p95_ms).filter((v): v is number => v !== null);
  return {
    calls: today.length,
    minutes: Math.round(minutes),
    cards: today.reduce((sum, c) => sum + c.cards, 0),
    p95: speeds.length ? Math.max(...speeds) : null,
  };
}

/** UX-25: questions this agent sent to the manager, newest first, from calls on this device
 * (agents cannot list the company inbox, draft D-050 (backlog)). */
export function myQuestions(calls: readonly DeviceCall[], max = 3): string[] {
  const out: string[] = [];
  for (const c of calls) {
    for (const e of [...c.transcript].reverse()) {
      const q = e.kind === "escalation" ? e.text.trim() : "";
      if (q && !out.includes(q)) out.push(q);
      if (out.length >= max) return out;
    }
  }
  return out;
}

/** UX-43b: the hero line: the next meeting, or a plain ready line. UX-002: a meeting on another
 * day says "tomorrow" or its weekday, so Monday's 11:00 never reads as today's. */
export function nextLine(
  t: ReturnType<typeof useI18n>["t"],
  locale: Locale,
  next: MeetingCandidate | null,
  now: Date = new Date(),
): string {
  if (!next || Number.isNaN(new Date(next.start).getTime())) return t("home.ready");
  // The title is often Latin inside an Arabic line: isolate its direction (FSI … PDI, UX-41).
  const title = `\u2068${next.title || t("meetings.untitled")}\u2069`;
  const time = formatTime(next.start, locale);
  const days = daysFromToday(next.start, now);
  if (days === 0) return t("home.next", { title, time });
  if (days === 1) return t("home.nextTomorrow", { title, time });
  return t("home.nextOn", { title, day: formatWeekday(next.start, locale), time });
}

/** UX-25 / ZC A14: plan and seats as one status line (admins and managers only). */
export function statusLine(
  t: ReturnType<typeof useI18n>["t"],
  c: {
    status: string;
    days_left: number | null;
    seats_used: number;
    seats: number;
    can_call: boolean;
  },
): string {
  const seats = { used: c.seats_used, total: c.seats };
  if (!c.can_call || c.status === "expired" || c.status === "suspended")
    return t("home.status.paused", seats);
  if (c.status === "trial") return t("home.status.trial", { days: c.days_left ?? 0, ...seats });
  return t("home.status.active", seats);
}

export function HomeScreen({ today }: { today?: React.ReactNode } = {}) {
  const { t, locale } = useI18n();
  const { color } = useTheme();
  const router = useRouter();
  const cloud = useCloud();
  const { role } = useRole();
  const wide = useWindowDimensions().width >= 1000;
  const openCount = useOpenCount();
  const calls = deviceCalls();
  const stats = todayStats(calls);
  const [next, setNext] = useState<MeetingCandidate | null>(null);
  const me = cloud.status === "signed_in" ? cloud.me : null;
  const bundle = cloud.status === "signed_in" ? cloud.bundle : null;
  const company = me?.company ?? null;
  const agent = role === "agent";
  const fmtTime = (ms: number) =>
    new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(new Date(ms));
  const fmtDay = (ms: number) =>
    Date.now() - ms < DAY_MS && ms >= startOfToday()
      ? t("home.today")
      : new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(ms));

  // UX-26: one neutral style for numbers; card colours stay on cards.
  const tiles: { id: string; label: string; value: string }[] = [
    { id: "calls", label: t("home.stat.calls"), value: String(stats.calls) },
    { id: "minutes", label: t("home.stat.minutes"), value: String(stats.minutes) },
    { id: "cards", label: t("home.stat.cards"), value: String(stats.cards) },
    {
      id: "speed",
      label: t("home.stat.speed"),
      value: stats.p95 === null ? "—" : `${(stats.p95 / 1000).toFixed(1)} s`,
    },
  ];
  const tip = calls.find((c) => c.review?.tip)?.review?.tip ?? null;
  const questions = agent ? myQuestions(allDeviceCalls()) : [];

  const side = (
    <View style={[styles.side, wide ? styles.sideWide : null]}>
      {wide ? today : null}
      {agent ? (
        <Section title={t("home.myQuestions")} testID="home-my-questions">
          {questions.length === 0 ? (
            <Text variant="label" tone="muted">
              {t("home.myQuestions.none")}
            </Text>
          ) : (
            questions.map((q) => (
              <Text key={q} variant="label" numberOfLines={2}>
                {q}
              </Text>
            ))
          )}
        </Section>
      ) : null}
      {!agent && company ? (
        <Section title={t("home.company")} testID="home-company">
          <Text weight="medium">{company.name}</Text>
          <Text variant="label" tone="muted" testID="home-status">
            {statusLine(t, company)}
          </Text>
        </Section>
      ) : null}
      {agent ? null : (
        <Section title={t("home.playbook")} testID="home-playbook">
          <LinkRow
            href="/playbook"
            label={t("home.entries")}
            value={String(bundle?.playbook.length ?? 0)}
            testID="home-playbook-entries"
          />
          <LinkRow
            href="/inbox"
            label={t("home.openQuestions")}
            value={
              <Badge label={String(openCount)} tone={openCount > 0 ? "objection" : "neutral"} />
            }
            testID="home-playbook-questions"
          />
        </Section>
      )}
    </View>
  );

  return (
    <ScrollView
      style={{ backgroundColor: color.background }}
      contentContainerStyle={[styles.page, wide ? styles.pageWide : null]}
      testID="home"
    >
      {/* Quiet Paper Glass (D-041): the page header is plain type on the canvas, not a box. */}
      <View style={styles.hero}>
        <View style={styles.flex}>
          <Text
            variant={wide ? "pageTitle" : "title"}
            weight="semibold"
            accessibilityRole="header"
            testID="home-next"
          >
            {nextLine(t, locale, next)}
          </Text>
          <Text variant={wide ? "heading" : "body"} tone="muted">
            {me
              ? `${me.user.name} · ${t(`role.short.${me.user.role}`)}${company ? ` · ${company.name}` : ""}`
              : t("home.signedOut")}
          </Text>
        </View>
        <Button
          label={t("home.start")}
          onPress={() => router.push("/call?prepare=1")}
          testID="home-start"
        />
      </View>

      <SetupChecklist />

      <DueSteps />

      <View style={styles.tiles}>
        {tiles.map((tile) => (
          <StatTile
            key={tile.id}
            label={tile.label}
            value={tile.value}
            testID={`home-stat-${tile.id}`}
            // UI-003: four equal tiles in one row when wide, an even 2×2 grid below (never 3 + 1).
            style={wide ? styles.tileQuarter : styles.tileHalf}
          />
        ))}
      </View>

      <View style={[styles.columns, wide ? styles.columnsWide : null]}>
        {wide ? null : today}
        <View style={styles.main}>
          {/* Owner request (14 Nov 2026): upcoming Zoho meetings first when connected. */}
          <HomeMeetings onLoaded={(m) => setNext(m[0] ?? null)} />
          {tip ? (
            <Section title={t("home.lastTip")} testID="home-last-tip">
              <Text>{tip}</Text>
            </Section>
          ) : null}
          <Section title={t("home.recent")} testID="home-recent">
            {calls.length === 0 ? (
              <Text tone="muted">{t("home.noCalls")}</Text>
            ) : (
              calls.slice(0, 6).map((c, i) => (
                <AppLink
                  key={c.id}
                  href={`/history/${c.id}`}
                  accessibilityRole="link"
                  testID={i === 0 ? "home-last-call" : undefined}
                  style={(state) => [
                    styles.callRow,
                    (state as { hovered?: boolean }).hovered
                      ? { backgroundColor: color.surfaceSunken }
                      : null,
                  ]}
                >
                  <View style={[styles.rowIcon, { backgroundColor: color.surfaceSunken }]}>
                    <Icon name="history" size={18} color={color.text} />
                  </View>
                  <View style={styles.flex}>
                    <Text weight="medium" numberOfLines={1}>
                      {i === 0 ? `${t("home.lastCall")} · ${c.title}` : c.title}
                    </Text>
                    <Text variant="label" tone="muted">
                      {`${fmtDay(c.started_at)} ${fmtTime(c.started_at)} · ${t("home.cardsN", { n: c.cards })}`}
                    </Text>
                  </View>
                  {c.p95_ms !== null ? (
                    <Badge
                      label={`${(c.p95_ms / 1000).toFixed(1)} s`}
                      tone={c.p95_ms <= 1500 ? "neutral" : "warning"}
                    />
                  ) : null}
                </AppLink>
              ))
            )}
          </Section>
        </View>
        {side}
      </View>
      <Text variant="label" tone="muted" style={styles.powered}>
        {t("brand.poweredBy")}
      </Text>
    </ScrollView>
  );
}

function Section({
  title,
  children,
  testID,
}: {
  title: string;
  children: React.ReactNode;
  testID?: string;
}) {
  const { color } = useTheme();
  return (
    <View
      testID={testID}
      style={[styles.section, { backgroundColor: color.surface, borderColor: color.border }]}
    >
      <Text variant="heading" weight="semibold" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

/** UI-004: a summary row that opens a page: a chevron at the reading end and a hover fill, so it
 * does not read like the static rows of the Company card. */
function LinkRow({
  href,
  label,
  value,
  testID,
}: {
  href: Href;
  label: string;
  value: React.ReactNode;
  testID: string;
}) {
  const { color } = useTheme();
  const rtl = useDirection() === "rtl";
  return (
    <AppLink
      href={href}
      accessibilityRole="link"
      testID={testID}
      style={(state) => [
        styles.linkRow,
        (state as { hovered?: boolean }).hovered ? { backgroundColor: color.surfaceSunken } : null,
      ]}
    >
      <View style={styles.flex}>
        <Row label={label} value={value} />
      </View>
      {/* The chevron glyph points down: turn it toward the end of the line. */}
      <View
        testID={`${testID}-chevron`}
        style={{ transform: [{ rotate: rtl ? "90deg" : "-90deg" }] }}
      >
        <Icon name="chevron" size={16} color={color.textMuted} />
      </View>
    </AppLink>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text variant="label" tone="muted" style={styles.flex} numberOfLines={1}>
        {label}
      </Text>
      {typeof value === "string" ? (
        <Text variant="label" weight="medium" style={styles.num}>
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.xl, gap: space.xl, maxWidth: 1180, width: "100%", alignSelf: "center" },
  pageWide: { paddingHorizontal: space.xxxl, paddingTop: space.xxxl },
  flex: { flex: 1, minWidth: 0 },
  hero: {
    flexDirection: "row",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: space.lg,
    marginBottom: space.sm,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  tileQuarter: { flexBasis: 0 },
  tileHalf: { flexBasis: "40%" },
  num: { fontVariant: ["tabular-nums"] },
  columns: { gap: space.lg },
  columnsWide: { flexDirection: "row", alignItems: "flex-start" },
  main: { flex: 2, minWidth: 0, gap: space.lg },
  side: { gap: space.lg },
  sideWide: { flex: 1, minWidth: 300, maxWidth: 380 },
  // Outlined card (DESIGN-SYSTEM §4.4): surface, hairline, 22 px radius, no shadow.
  section: {
    padding: space.xl,
    gap: space.md,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 28 },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    marginHorizontal: -space.sm,
    borderRadius: radius.lg,
  },
  callRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    marginHorizontal: -space.sm,
    borderRadius: radius.lg,
  },
  powered: { textAlign: "center", marginTop: space.md },
});
