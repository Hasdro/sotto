/**
 * Reports (owner, 22 Oct): turns the server's per-call numbers into what the charts show. Pure;
 * no words from any call ever reach the server, only counts, speed, source and review scores.
 */
import { type CallSource, isCallSource } from "../../lib/callSource";

export const SKILLS = [
  "opening",
  "discovery",
  "listening",
  "objections",
  "clarity",
  "next_step",
] as const;
export type Skill = (typeof SKILLS)[number];

export type UsageRow = {
  id: string;
  user_id: string;
  name?: string;
  email?: string;
  started_at: number;
  duration_s: number;
  cards: number;
  playbook_cards: number;
  ai_cards: number;
  holding_lines: number;
  escalations: number;
  p50_ms: number | null;
  p95_ms: number | null;
  source?: string | null;
  review?: { scores: Record<Skill, number>; success: number; sentiment: string } | null;
};

export type Report = {
  calls: number;
  minutes: number;
  cards: number;
  /** Mean chance to close over reviewed calls, 0–100; null without reviews. */
  success: number | null;
  /** Median of the calls' p50 speeds, ms. */
  speedMs: number | null;
  days: { day: string; calls: number }[];
  cardSources: { key: "playbook" | "ai" | "holding"; n: number }[];
  sources: { source: CallSource; calls: number }[];
  skills: { skill: Skill; score: number }[];
  agents: AgentRow[];
};

export type AgentRow = {
  id: string;
  name: string;
  calls: number;
  minutes: number;
  success: number | null;
  /** Change in mean chance to close: the later half of the period minus the earlier half. */
  trend: number | null;
  focus: Skill | null;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};
const round = (v: number | null) => (v === null ? null : Math.round(v));
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function skillMeans(rows: UsageRow[]): { skill: Skill; score: number }[] {
  const reviewed = rows.flatMap((r) => (r.review ? [r.review] : []));
  if (!reviewed.length) return [];
  return SKILLS.map((skill) => ({
    skill,
    score: Math.round((mean(reviewed.map((r) => r.scores[skill])) ?? 0) * 10) / 10,
  }));
}

export function buildReport(rows: UsageRow[], spanDays: number, now = Date.now()): Report {
  const days: { day: string; calls: number }[] = [];
  for (let i = spanDays - 1; i >= 0; i--)
    days.push({ day: dayKey(now - i * 86_400_000), calls: 0 });
  const byDay = new Map(days.map((d) => [d.day, d]));
  const sources = new Map<CallSource, number>();
  for (const r of rows) {
    const d = byDay.get(dayKey(r.started_at));
    if (d) d.calls += 1;
    const s: CallSource = isCallSource(r.source) ? r.source : "computer";
    sources.set(s, (sources.get(s) ?? 0) + 1);
  }
  const successes = rows.flatMap((r) => (r.review ? [r.review.success] : []));
  const agents = new Map<string, UsageRow[]>();
  for (const r of rows) agents.set(r.user_id, [...(agents.get(r.user_id) ?? []), r]);
  const mid = now - (spanDays * 86_400_000) / 2;
  return {
    calls: rows.length,
    minutes: Math.round(rows.reduce((a, r) => a + r.duration_s, 0) / 60),
    cards: rows.reduce((a, r) => a + r.cards, 0),
    success: round(mean(successes)),
    speedMs: round(median(rows.flatMap((r) => (r.p50_ms === null ? [] : [r.p50_ms])))),
    days,
    cardSources: [
      { key: "playbook", n: rows.reduce((a, r) => a + r.playbook_cards, 0) },
      { key: "ai", n: rows.reduce((a, r) => a + r.ai_cards, 0) },
      { key: "holding", n: rows.reduce((a, r) => a + r.holding_lines, 0) },
    ],
    sources: [...sources.entries()]
      .map(([source, calls]) => ({ source, calls }))
      .sort((a, b) => b.calls - a.calls),
    skills: skillMeans(rows),
    agents: [...agents.entries()]
      .map(([id, mine]): AgentRow => {
        const early = mine.filter((r) => r.review && r.started_at < mid);
        const late = mine.filter((r) => r.review && r.started_at >= mid);
        const a = mean(early.map((r) => r.review?.success ?? 0));
        const b = mean(late.map((r) => r.review?.success ?? 0));
        const skills = skillMeans(mine);
        const weakest = skills.length
          ? skills.reduce((lo, s) => (s.score < lo.score ? s : lo)).skill
          : null;
        return {
          id,
          name: mine[0]?.name || mine[0]?.email || "—",
          calls: mine.length,
          minutes: Math.round(mine.reduce((x, r) => x + r.duration_s, 0) / 60),
          success: round(mean(mine.flatMap((r) => (r.review ? [r.review.success] : [])))),
          trend: a === null || b === null ? null : Math.round(b - a),
          focus: weakest,
        };
      })
      .sort((x, y) => y.calls - x.calls),
  };
}
