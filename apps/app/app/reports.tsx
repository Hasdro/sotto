/**
 * Reports (owner, 22 Oct): calls, minutes, chance to close and speed; calls per day; where calls
 * come from; where cards come from; skill scores; and, for admins and managers, one row per
 * agent with their trend and the skill to coach. Agents see only their own calls.
 * One hue (the brand) for every bar, with labels, so nothing depends on telling colours apart.
 */

import {
  EmptyState,
  Icon,
  type IconName,
  layout,
  Panel,
  radius,
  Screen,
  SegmentedControl,
  Spinner,
  space,
  Text,
  useTheme,
} from "@sotto/ui";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { FeatureGate } from "../components/FeatureGate";
import { PageHeader } from "../components/PageHeader";
import { buildReport, dayAxis, type Report, type UsageRow } from "../features/reports/data";
import { topObjections } from "../features/reports/objections";
import { SOURCE_META } from "../lib/callSource";
import { cloudActive, cloudApi } from "../lib/cloud";
import { allDeviceCalls } from "../lib/deviceHistory";
import { formatDay } from "../lib/format";
import { countKey } from "../lib/i18n";
import { useI18n } from "../lib/locale";
import { useCloud } from "../lib/useCloud";

type Span = "7" | "30" | "90";

export default () => (
  <FeatureGate feature="reports">
    <ReportsScreen />
  </FeatureGate>
);
function ReportsScreen() {
  const { t } = useI18n();
  const cloud = useCloud();
  const role = cloud.status === "signed_in" ? cloud.me.user.role : "agent";
  const [span, setSpan] = useState<Span>("30");
  const [rows, setRows] = useState<UsageRow[] | null | "error">(null);
  useEffect(() => {
    if (!cloudActive()) {
      setRows([]);
      return;
    }
    let live = true;
    setRows(null);
    cloudApi<{ calls: UsageRow[] }>(`/api/v1/company/usage?days=${span}`)
      .then((r) => live && setRows(r.calls))
      .catch(() => live && setRows("error"));
    return () => {
      live = false;
    };
  }, [span]);
  const report = useMemo(
    () => (Array.isArray(rows) ? buildReport(rows, Number(span)) : null),
    [rows, span],
  );
  const team = role === "admin" || role === "manager";
  return (
    <Screen scroll maxWidth={layout.contentMaxWidth} testID="reports" style={styles.page}>
      <PageHeader
        icon="reports"
        title={t("reports.title")}
        subtitle={t(team ? "reports.subtitle.team" : "reports.subtitle.mine")}
        actions={
          <SegmentedControl
            accessibilityLabel={t("reports.span")}
            value={span}
            onChange={setSpan}
            testID="reports-span"
            options={[
              { value: "7", label: t("reports.days", { n: 7 }) },
              { value: "30", label: t("reports.days", { n: 30 }) },
              { value: "90", label: t("reports.days", { n: 90 }) },
            ]}
          />
        }
      />
      {rows === "error" ? (
        <EmptyState
          mascot="offline"
          title={t("reports.error.title")}
          body={t("reports.error.body")}
        />
      ) : report && report.calls === 0 ? (
        <EmptyState title={t("reports.none.title")} body={t("reports.none.body")} />
      ) : report ? (
        <ReportView report={report} team={team} />
      ) : (
        <ReportsLoading />
      )}
    </Screen>
  );
}

/** UI-009: while the numbers load, the page keeps its shape (tiles and the chart) and says so,
 * instead of a blank space under the period picker. */
function ReportsLoading() {
  const { t } = useI18n();
  const { color } = useTheme();
  const block = { backgroundColor: color.surfaceSunken };
  return (
    <View
      style={styles.body}
      testID="reports-loading"
      accessible
      accessibilityRole="progressbar"
      aria-busy
      accessibilityLabel={t("reports.loading")}
    >
      <View style={styles.tiles}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[styles.tile, { backgroundColor: color.surface, borderColor: color.border }]}
          >
            <View style={[styles.skelLine, block]} />
            <View style={[styles.skelValue, block]} />
          </View>
        ))}
      </View>
      <Panel style={styles.panel}>
        <View style={styles.heading}>
          <Spinner />
          <Text variant="label" tone="muted">
            {t("reports.loading")}
          </Text>
        </View>
        <View style={[styles.skelChart, block]} />
      </Panel>
    </View>
  );
}

function ReportView({ report: r, team }: { report: Report; team: boolean }) {
  const { t } = useI18n();
  const sec = r.speedMs === null ? "—" : `${(r.speedMs / 1000).toFixed(2)} s`;
  return (
    <View style={styles.body}>
      <View style={styles.tiles}>
        <Tile icon="call" label={t("reports.calls")} value={String(r.calls)} />
        <Tile icon="timer" label={t("reports.minutes")} value={String(r.minutes)} />
        <Tile
          icon="target"
          label={t("reports.success")}
          value={r.success === null ? "—" : `${r.success}%`}
        />
        <Tile icon="bolt" label={t("reports.speed")} value={sec} />
      </View>

      <Panel style={styles.panel} testID="reports-days">
        <Heading icon="calendar" text={t("reports.perDay")} />
        <DayBars days={r.days} />
      </Panel>

      <View style={styles.two}>
        <Panel style={[styles.panel, styles.half]} testID="reports-sources">
          <Heading icon="video" text={t("reports.sources")} />
          <Bars
            items={r.sources.map((s) => ({
              key: s.source,
              label: SOURCE_META[s.source].name,
              icon: SOURCE_META[s.source].icon,
              value: s.calls,
            }))}
          />
        </Panel>
        <Panel style={[styles.panel, styles.half]} testID="reports-cards">
          <Heading icon="cards" text={t("reports.cardSources")} />
          <Bars
            items={r.cardSources.map((c) => ({
              key: c.key,
              label: t(`reports.cardSource.${c.key}`),
              icon: c.key === "playbook" ? "playbook" : c.key === "ai" ? "spark" : "timer",
              value: c.n,
            }))}
          />
        </Panel>
      </View>

      {r.skills.length ? (
        <Panel style={styles.panel} testID="reports-skills">
          <Heading icon="spark" text={t("reports.skills")} />
          <Bars
            max={10}
            items={r.skills.map((s) => ({
              key: s.skill,
              label: t(`review.dim.${s.skill}`),
              value: s.score,
              suffix: "/10",
            }))}
          />
        </Panel>
      ) : null}

      <Objections />

      {team && r.agents.length ? <Agents rows={r.agents} /> : null}
    </View>
  );
}

/** Top objections from the calls on this computer (call words never leave the device). */
function Objections() {
  const { t } = useI18n();
  const items = useMemo(() => topObjections(allDeviceCalls()), []);
  if (!items.length) return null;
  return (
    <Panel style={styles.panel} testID="reports-objections">
      <Heading icon="message" text={t("reports.objections")} />
      <Text variant="label" tone="muted">
        {t("reports.objections.note")}
      </Text>
      <Bars
        items={items.map((o) => ({
          key: o.theme,
          label: t(`reports.theme.${o.theme}`),
          value: o.count,
        }))}
      />
      {items.map((o) => (
        <Text key={o.theme} variant="label" tone="muted" numberOfLines={1}>
          {`${t(`reports.theme.${o.theme}`)} — “${o.example}” · ${t("reports.objection.row", {
            n: o.count,
            s: o.success === null ? "—" : `${o.success}%`,
          })}`}
        </Text>
      ))}
    </Panel>
  );
}

function Tile({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  const { color } = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: color.surface, borderColor: color.border }]}>
      <View style={styles.tileLabel}>
        <Icon name={icon} size={17} />
        <Text variant="label" tone="muted">
          {label}
        </Text>
      </View>
      <Text variant="title" weight="semibold" style={styles.num}>
        {value}
      </Text>
    </View>
  );
}

function Heading({ icon, text }: { icon: IconName; text: string }) {
  const { color } = useTheme();
  return (
    <View style={styles.heading} accessibilityRole="header" aria-level={3}>
      <Icon name={icon} size={19} color={color.textMuted} />
      <Text variant="heading" weight="semibold">
        {text}
      </Text>
    </View>
  );
}

/** Pixels a bar needs to carry its count above it (two digits at label size). */
const VALUE_MIN_WIDTH = 22;

/**
 * Calls per day: one bar per day on a labelled scale (UI-009): round ticks with light grid
 * lines, days written as "29 Oct" / "Today", the count above each busy day when the bars are
 * wide enough, and the day and count on hover or tap (and in each bar's accessible label).
 */
function DayBars({ days }: { days: { day: string; calls: number }[] }) {
  const { color } = useTheme();
  const { t, locale } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const { top, ticks } = dayAxis(Math.max(0, ...days.map((d) => d.calls)));
  const h = 140;
  const y = (v: number) => (v / top) * (h - 8);
  const shown = hover === null ? null : days[hover];
  const dayName = (day: string) => formatDay(day, locale);
  const valueText = (d: { day: string; calls: number }) =>
    t(countKey("reports.dayValue", d.calls), { day: dayName(d.day), n: d.calls });
  const values = days.length > 0 && width / days.length >= VALUE_MIN_WIDTH;
  const first = days[0];
  const last = days.at(-1);
  return (
    <View>
      <Text variant="label" tone="muted" style={styles.readout}>
        {shown ? valueText(shown) : t("reports.dayHint")}
      </Text>
      <View style={styles.chart}>
        <View style={[styles.axisY, { height: h }]} testID="reports-days-axis">
          {ticks.map((v) => (
            <Text key={v} variant="label" tone="muted" style={[styles.tick, { bottom: y(v) - 9 }]}>
              {String(v)}
            </Text>
          ))}
        </View>
        <View style={styles.plot}>
          <View
            testID="reports-days-bars"
            onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
            style={[styles.daysRow, { height: h, borderBottomColor: color.border }]}
          >
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              {ticks
                .filter((v) => v > 0)
                .map((v) => (
                  <View
                    key={v}
                    style={[styles.gridLine, { bottom: y(v), backgroundColor: color.border }]}
                  />
                ))}
            </View>
            {days.map((d, i) => (
              <Pressable
                key={d.day}
                accessibilityLabel={valueText(d)}
                onHoverIn={() => setHover(i)}
                onHoverOut={() => setHover(null)}
                onPress={() => setHover(i)}
                style={styles.dayHit}
              >
                {values && d.calls > 0 ? (
                  <Text
                    variant="label"
                    tone="muted"
                    style={styles.value}
                    testID={`reports-day-value-${d.day}`}
                  >
                    {String(d.calls)}
                  </Text>
                ) : null}
                <View
                  style={{
                    height: d.calls ? Math.max(4, y(d.calls)) : 0,
                    borderTopLeftRadius: 4,
                    borderTopRightRadius: 4,
                    backgroundColor: color.primary,
                    opacity: hover === null || hover === i ? 1 : 0.45,
                  }}
                />
              </Pressable>
            ))}
          </View>
          <View style={styles.axis}>
            <Text variant="label" tone="muted" testID="reports-days-first">
              {first ? dayName(first.day) : ""}
            </Text>
            <Text variant="label" tone="muted" testID="reports-days-last">
              {last ? dayName(last.day) : ""}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/** Horizontal bars with the label and value written beside each. */
function Bars({
  items,
  max,
}: {
  items: { key: string; label: string; icon?: IconName; value: number; suffix?: string }[];
  max?: number;
}) {
  const { color } = useTheme();
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <View style={styles.bars}>
      {items.map((i) => (
        <View key={i.key} style={styles.barRow}>
          <View style={styles.barLabel}>
            {i.icon ? <Icon name={i.icon} size={15} /> : null}
            <Text variant="label" numberOfLines={1} style={styles.barLabelText}>
              {i.label}
            </Text>
          </View>
          <View style={[styles.barTrack, { backgroundColor: color.surfaceSunken }]}>
            <View
              style={[
                styles.barFill,
                { width: `${(i.value / top) * 100}%`, backgroundColor: color.primary },
              ]}
            />
          </View>
          <Text variant="label" weight="semibold" style={[styles.barValue, styles.num]}>
            {`${i.value}${i.suffix ?? ""}`}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Agents({ rows }: { rows: Report["agents"] }) {
  const { t } = useI18n();
  const { color } = useTheme();
  return (
    <Panel style={styles.panel} testID="reports-agents">
      <Heading icon="users" text={t("reports.agents")} />
      {rows.map((a, i) => (
        <View
          key={a.id}
          style={[styles.agent, i > 0 ? { borderTopColor: color.border, borderTopWidth: 1 } : null]}
        >
          <Text weight="semibold" style={styles.agentName} numberOfLines={1}>
            {a.name}
          </Text>
          <View style={styles.agentFact}>
            <Icon name="call" size={14} />
            <Text variant="label" tone="muted">
              {a.calls}
            </Text>
          </View>
          <View style={styles.agentFact}>
            <Icon name="timer" size={14} />
            <Text variant="label" tone="muted">
              {a.minutes}
            </Text>
          </View>
          <View style={styles.agentFact}>
            <Icon name="target" size={14} />
            <Text variant="label" tone="muted">
              {a.success === null ? "—" : `${a.success}%`}
            </Text>
          </View>
          <Text
            variant="label"
            weight="medium"
            tone={a.trend === null ? "muted" : a.trend >= 0 ? "positive" : "negative"}
          >
            {a.trend === null ? "—" : `${a.trend >= 0 ? "+" : "−"}${Math.abs(a.trend)}`}
          </Text>
          <Text variant="label" tone="muted" numberOfLines={1} style={styles.focus}>
            {a.focus ? `${t("reports.coach")}: ${t(`review.dim.${a.focus}`)}` : ""}
          </Text>
        </View>
      ))}
    </Panel>
  );
}

const styles = StyleSheet.create({
  page: { paddingTop: space.xl },
  body: { gap: space.lg },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  tileLabel: { flexDirection: "row", alignItems: "center", gap: space.xs },
  heading: { flexDirection: "row", alignItems: "center", gap: space.xs },
  tile: {
    flexGrow: 1,
    flexBasis: 180,
    padding: space.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: space.xs,
  },
  num: { fontVariant: ["tabular-nums"] },
  panel: { gap: space.md },
  two: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  half: { flexGrow: 1, flexBasis: 320 },
  readout: { minHeight: 18 },
  chart: { flexDirection: "row", gap: space.xs },
  axisY: { minWidth: 28, position: "relative" },
  tick: { position: "absolute", end: 0, fontVariant: ["tabular-nums"] },
  plot: { flex: 1, minWidth: 0 },
  gridLine: { position: "absolute", start: 0, end: 0, height: 1, opacity: 0.7 },
  value: { textAlign: "center", fontVariant: ["tabular-nums"] },
  skelLine: { height: 12, width: "45%", borderRadius: radius.pill },
  skelValue: { height: 26, width: "30%", borderRadius: radius.md },
  skelChart: { height: 140, borderRadius: radius.lg },
  daysRow: { flexDirection: "row", alignItems: "flex-end", gap: 2, borderBottomWidth: 1 },
  dayHit: { flex: 1, height: "100%", justifyContent: "flex-end" },
  axis: { flexDirection: "row", justifyContent: "space-between", marginTop: space.xs },
  bars: { gap: space.sm },
  barRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  barLabel: { width: 150, flexDirection: "row", alignItems: "center", gap: space.xs },
  barLabelText: { flexShrink: 1 },
  barTrack: { flex: 1, height: 10, borderRadius: 5, overflow: "hidden" },
  barFill: { height: 10, borderRadius: 5 },
  barValue: { width: 52, textAlign: "right" },
  agent: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: space.lg,
    rowGap: space.xs,
    paddingVertical: space.sm,
  },
  agentName: { flexBasis: 160, flexGrow: 1 },
  agentFact: { flexDirection: "row", alignItems: "center", gap: 4 },
  focus: { flexBasis: 200 },
});
