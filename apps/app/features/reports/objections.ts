/**
 * Top objections (owner, 22 Oct): what customers pushed back on, grouped into themes, with how
 * often each came up and the average chance to close of the calls it came up in. Read from the
 * calls kept on this computer (D-022: call words never leave the device).
 */
import type { DeviceCall } from "../../lib/deviceHistory";

export const THEMES = ["price", "timing", "think", "competitor", "trust", "other"] as const;
export type Theme = (typeof THEMES)[number];

const RULES: [Theme, RegExp][] = [
  ["price", /price|expensive|cost|budget|afford|cheap|discount|pay|money|غالي|سعر|خصم|ميزانية/i],
  ["timing", /later|next (week|month|year)|not now|busy|time|wait|بعدين|لاحقا|مشغول|وقت/i],
  ["think", /think|consider|discuss|partner|wife|husband|boss|team|decide|أفكر|أستشير|زوج/i],
  [
    "competitor",
    /other (company|provider)|competitor|already (have|use)|another|cheaper elsewhere|شركة ثانية|منافس/i,
  ],
  ["trust", /sure|guarantee|trust|review|risk|scam|proof|ضمان|ثقة|متأكد/i],
];

export function themeOf(text: string): Theme {
  return RULES.find(([, re]) => re.test(text))?.[0] ?? "other";
}

export type ObjectionTheme = {
  theme: Theme;
  count: number;
  success: number | null;
  example: string;
};

/** The customer line just before each objection card, grouped by theme, most frequent first. */
export function topObjections(calls: readonly DeviceCall[]): ObjectionTheme[] {
  const acc = new Map<Theme, { count: number; wins: number[]; example: string }>();
  for (const call of calls) {
    let said = "";
    for (const e of call.transcript) {
      if (e.kind === "line" && e.speaker === "customer") said = e.text;
      if (e.kind === "card" && e.type === "objection" && said) {
        const theme = themeOf(said);
        const a = acc.get(theme) ?? { count: 0, wins: [], example: said };
        a.count += 1;
        if (call.review) a.wins.push(call.review.success);
        acc.set(theme, a);
        said = "";
      }
    }
  }
  return [...acc.entries()]
    .map(([theme, a]) => ({
      theme,
      count: a.count,
      success: a.wins.length ? Math.round(a.wins.reduce((x, y) => x + y, 0) / a.wins.length) : null,
      example: a.example,
    }))
    .sort((x, y) => y.count - x.count);
}

/** Calls on this computer whose words contain the query (case- and accent-insensitive). */
export function searchCalls(calls: readonly DeviceCall[], query: string): Map<string, string> {
  const fold = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  const q = fold(query.trim());
  const hits = new Map<string, string>();
  if (!q) return hits;
  for (const call of calls) {
    const line = call.transcript.find((e) => e.kind !== "escalation" && fold(e.text).includes(q));
    if (line) hits.set(call.id, line.text);
  }
  return hits;
}
