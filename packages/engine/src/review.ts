/**
 * After-call review (owner, 21 Oct): one request to the summary stage after the call ends, with
 * the `review` prompt from the seed. The reply is checked and clamped before anyone sees it; a
 * missing key, a failure or an unreadable reply gives null and the app says so plainly.
 */
import type { ModelRouter } from "./router.ts";
import { renderPrompt } from "./turns.ts";
import type { CompanyProfile, PromptRecord } from "./types.ts";

export const REVIEW_DIMENSIONS = [
  "opening",
  "discovery",
  "listening",
  "objections",
  "clarity",
  "next_step",
] as const;
export type ReviewDimension = (typeof REVIEW_DIMENSIONS)[number];

export type CallReview = {
  scores: Record<ReviewDimension, number>;
  /** 0–100: the model's estimate that the customer buys. */
  success: number;
  sentiment: "positive" | "neutral" | "negative";
  summary: string;
  tip: string;
  strengths: string[];
  improve: string[];
};

export type ReviewLine = { speaker: "customer" | "agent"; text: string };

const clamp = (v: unknown, lo: number, hi: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : lo;
};
const text = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const list = (v: unknown): string[] =>
  Array.isArray(v)
    ? v
        .map((x) => text(x, 80))
        .filter(Boolean)
        .slice(0, 3)
    : [];

/** Reads the model's JSON (also when wrapped in prose or a code fence); null when unusable. */
export function parseReview(raw: string): CallReview | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const s = (data.scores ?? {}) as Record<string, unknown>;
  if (typeof s !== "object" || !REVIEW_DIMENSIONS.some((d) => d in s)) return null;
  const sentiment = data.sentiment;
  const tip = text(data.tip, 240);
  if (!tip) return null;
  return {
    scores: Object.fromEntries(REVIEW_DIMENSIONS.map((d) => [d, clamp(s[d], 0, 10)])) as Record<
      ReviewDimension,
      number
    >,
    success: clamp(data.success, 0, 100),
    sentiment: sentiment === "positive" || sentiment === "negative" ? sentiment : "neutral",
    summary: text(data.summary, 400),
    tip,
    strengths: list(data.strengths),
    improve: list(data.improve),
  };
}

export function transcriptText(lines: readonly ReviewLine[]): string {
  return lines
    .map((l) => `${l.speaker === "customer" ? "Customer" : "Agent"}: ${l.text}`)
    .join("\n");
}

/** Asks the summary stage for a review; never throws. */
export async function reviewCall(opts: {
  router: ModelRouter;
  prompt: PromptRecord | undefined;
  company: CompanyProfile;
  lines: readonly ReviewLine[];
  now: number;
  signal?: AbortSignal;
}): Promise<CallReview | null> {
  if (!opts.prompt || !opts.lines.some((l) => l.speaker === "customer")) return null;
  try {
    const body = renderPrompt(opts.prompt.body, {
      "company.name": opts.company.name,
      "company.call_goal": opts.company.call_goal,
      "company.context": opts.company.context?.trim() || "(none)",
      "call.transcript": transcriptText(opts.lines).slice(-12_000),
    });
    let out = "";
    for await (const chunk of opts.router.stream(
      "summary",
      {
        system: "",
        messages: [{ role: "user", content: body }],
        max_tokens: 900,
        temperature: 0.2,
        settings: {},
      },
      { t0: opts.now, ...(opts.signal ? { signal: opts.signal } : {}) },
    ))
      out += chunk;
    return parseReview(out);
  } catch (err) {
    console.warn("[engine] review failed", err);
    return null;
  }
}

export type FollowUp = { subject: string; body: string };

/** Splits "SUBJECT: …\n<body>"; null when the model gave nothing usable. Exported for tests. */
export function parseFollowUp(raw: string): FollowUp | null {
  const text = raw.trim();
  const m = /^SUBJECT:\s*(.+)\n([\s\S]+)$/i.exec(text);
  const subject = (m?.[1] ?? "").trim().slice(0, 200);
  const body = (m?.[2] ?? text).trim().slice(0, 4000);
  return body ? { subject, body } : null;
}

/** Drafts the customer follow-up email on the summary stage (owner, 22 Oct); never throws. */
export async function draftFollowUp(opts: {
  router: ModelRouter;
  prompt: PromptRecord | undefined;
  company: CompanyProfile;
  lines: readonly ReviewLine[];
  now: number;
}): Promise<FollowUp | null> {
  if (!opts.prompt || !opts.lines.some((l) => l.speaker === "customer")) return null;
  try {
    const body = renderPrompt(opts.prompt.body, {
      "company.name": opts.company.name,
      "company.tone": opts.company.tone,
      "company.context": opts.company.context?.trim() || "(none)",
      "call.transcript": transcriptText(opts.lines).slice(-12_000),
    });
    let out = "";
    for await (const chunk of opts.router.stream(
      "summary",
      {
        system: "",
        messages: [{ role: "user", content: body }],
        max_tokens: 500,
        temperature: 0.3,
        settings: {},
      },
      { t0: opts.now },
    ))
      out += chunk;
    return parseFollowUp(out);
  } catch (err) {
    console.warn("[engine] follow-up draft failed", err);
    return null;
  }
}
