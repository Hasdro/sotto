/**
 * Home (owner, 21 Oct): who you are, your company and plan, the AI in use, today's numbers and
 * recent calls, so the app opens on something useful instead of an empty call screen.
 * Everything here is already on the device (session, bundle, on-device calls): no extra requests.
 */

import { Badge, Button, type Hex, Mascot, radius, space, Text, useTheme } from "@sotto/ui";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { AppLink } from "../../components/AppLink";
import { providerOf } from "../../lib/cloudCompat";
import { deviceCalls } from "../../lib/deviceHistory";
import { useI18n } from "../../lib/locale";
import { useCloud } from "../../lib/useCloud";
import { HomeMeetings } from "../crm/HomeMeetings";
import { useOpenCount } from "../escalations/store";

const DAY_MS = 86_400_000;
const STAGES = ["suggest", "suggest_backup", "stt", "stt_backup"] as const;

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

function greeting(hour: number): "home.morning" | "home.afternoon" | "home.evening" {
  if (hour < 12) return "home.morning";
  if (hour < 18) return "home.afternoon";
  return "home.evening";
}

export function HomeScreen() {
  const { t, locale } = useI18n();
  const { color, card } = useTheme();
  const router = useRouter();
  const cloud = useCloud();
  const wide = useWindowDimensions().width >= 1000;
  const openCount = useOpenCount();
  const calls = deviceCalls();
  const stats = todayStats(calls);
  const me = cloud.status === "signed_in" ? cloud.me : null;
  const bundle = cloud.status === "signed_in" ? cloud.bundle : null;
  const company = me?.company ?? null;
  const first = me?.user.name.split(" ")[0] ?? "";
  const fmtTime = (ms: number) =>
    new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(new Date(ms));
  const fmtDay = (ms: number) =>
    Date.now() - ms < DAY_MS && ms >= startOfToday()
      ? t("home.today")
      : new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(ms));

  const tiles: { label: string; value: string; accent: Hex }[] = [
    { label: t("home.stat.calls"), value: String(stats.calls), accent: card.answer.accent },
    { label: t("home.stat.minutes"), value: String(stats.minutes), accent: card.question.accent },
    { label: t("home.stat.cards"), value: String(stats.cards), accent: color.positive },
    {
      label: t("home.stat.speed"),
      value: stats.p95 === null ? "—" : `${(stats.p95 / 1000).toFixed(1)} s`,
      accent: card.objection.accent,
    },
  ];

  const side = (
    <View style={[styles.side, wide ? styles.sideWide : null]}>
      {company ? (
        <Section title={t("home.company")} testID="home-company">
          <Row
            label={company.name}
            value={
              <Badge
                label={t(`home.plan.${company.status}`)}
                tone={
                  company.status === "active"
                    ? "answer"
                    : company.status === "trial"
                      ? "question"
                      : "warning"
                }
              />
            }
          />
          {company.days_left !== null ? (
            <Row label={t("home.daysLeft")} value={String(company.days_left)} />
          ) : null}
          <Meter
            label={t("home.seats", { used: company.seats_used, total: company.seats })}
            value={company.seats_used / Math.max(1, company.seats)}
            fill={card.question.accent}
          />
          <Meter
            label={t("home.minutes", { used: company.minutes_used, total: company.minutes_month })}
            value={company.minutes_used / Math.max(1, company.minutes_month)}
            fill={card.answer.accent}
          />
        </Section>
      ) : null}
      {bundle ? (
        <Section title={t("home.ai")} testID="home-ai">
          {STAGES.map((id) => {
            const route = bundle.stages[id];
            const pid = providerOf(bundle, route);
            const provider = pid ? bundle.providers[pid] : undefined;
            const ready = provider
              ? (bundle.key_status?.[provider.key_env] ?? null) !== null
              : false;
            return (
              <View key={id} style={styles.aiRow}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: ready ? color.positive : color.borderStrong },
                  ]}
                  accessibilityLabel={ready ? t("home.ai.ready") : t("home.ai.missing")}
                />
                <View style={styles.flex}>
                  <Text variant="label" tone="muted">
                    {bundle.stage_slots[id]?.label ?? id}
                  </Text>
                  <Text variant="label" weight="medium" numberOfLines={1}>
                    {provider ? `${provider.name} · ${route?.model ?? ""}` : t("home.ai.none")}
                  </Text>
                </View>
              </View>
            );
          })}
        </Section>
      ) : null}
      <Section title={t("home.playbook")} testID="home-playbook">
        <Row label={t("home.entries")} value={String(bundle?.playbook.length ?? 0)} />
        <AppLink href="/inbox" accessibilityRole="link">
          <Row
            label={t("home.openQuestions")}
            value={
              <Badge label={String(openCount)} tone={openCount > 0 ? "objection" : "neutral"} />
            }
          />
        </AppLink>
      </Section>
    </View>
  );

  return (
    <ScrollView
      style={{ backgroundColor: color.background }}
      contentContainerStyle={styles.page}
      testID="home"
    >
      <View style={[styles.hero, { backgroundColor: color.surface, borderColor: color.border }]}>
        <Mascot state={me ? "idle" : "offline"} size={56} />
        <View style={styles.flex}>
          <Text variant="title" weight="semibold">
            {t(greeting(new Date().getHours()), { name: first })}
          </Text>
          <Text tone="muted">
            {me
              ? `${me.user.email} · ${t(`role.short.${me.user.role}`)}${company ? ` · ${company.name}` : ""}`
              : t("home.signedOut")}
          </Text>
        </View>
        <Button label={t("home.start")} onPress={() => router.push("/call")} testID="home-start" />
      </View>

      <View style={styles.tiles}>
        {tiles.map((tile) => (
          <View
            key={tile.label}
            style={[styles.tile, { backgroundColor: color.surface, borderColor: color.border }]}
          >
            <View style={[styles.tileBar, { backgroundColor: tile.accent }]} />
            <Text variant="label" tone="muted">
              {tile.label}
            </Text>
            <Text variant="title" weight="semibold" style={styles.num}>
              {tile.value}
            </Text>
          </View>
        ))}
      </View>

      <View style={[styles.columns, wide ? styles.columnsWide : null]}>
        <View style={styles.main}>
          {/* Owner request (14 Nov 2026): upcoming Zoho meetings first when connected. */}
          <HomeMeetings />
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
                    { borderColor: color.border },
                    i === 0 ? { backgroundColor: card.answer.fill } : null,
                    (state as { hovered?: boolean }).hovered
                      ? { backgroundColor: color.surfaceSunken }
                      : null,
                  ]}
                >
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
                      tone={c.p95_ms <= 1500 ? "answer" : "warning"}
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
      <Text weight="semibold">{title}</Text>
      {children}
    </View>
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

function Meter({ label, value, fill }: { label: string; value: number; fill: Hex }) {
  const { color } = useTheme();
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <View
      style={styles.meter}
      accessibilityRole="progressbar"
      accessibilityValue={{ now: pct, min: 0, max: 100 }}
    >
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <View style={[styles.track, { backgroundColor: color.surfaceSunken }]}>
        <View style={[styles.bar, { width: `${pct}%`, backgroundColor: fill }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.xl, gap: space.lg, maxWidth: 1240, width: "100%", alignSelf: "center" },
  flex: { flex: 1, minWidth: 0 },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space.lg,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  tile: {
    flexGrow: 1,
    flexBasis: 180,
    padding: space.lg,
    paddingTop: space.lg + 3,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    gap: space.xs,
  },
  tileBar: { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  num: { fontVariant: ["tabular-nums"] },
  columns: { gap: space.lg },
  columnsWide: { flexDirection: "row", alignItems: "flex-start" },
  main: { flex: 2, minWidth: 0, gap: space.lg },
  side: { gap: space.lg },
  sideWide: { flex: 1, minWidth: 300, maxWidth: 380 },
  section: {
    padding: space.lg,
    gap: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 28 },
  aiRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  dot: { width: 8, height: 8, borderRadius: 4 },
  meter: { gap: space.xs },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  bar: { height: 6, borderRadius: 3 },
  callRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  powered: { textAlign: "center", marginTop: space.md },
});
