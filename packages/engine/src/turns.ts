/**
 * Trigger rules and the verdict parser, ported from sotto_worker/pipeline/trigger.py and
 * verdict.py. R4: only final customer turns can trigger a card.
 */
import type { TranscriptEvent } from "./types.ts";

/** statement: anything else the customer says; signal: buying interest (owner, 21 Oct). */
export type TurnKind = "question" | "objection" | "signal" | "statement";

const OBJECTION = new RegExp(
  "\\b(too expensive|expensive|cheaper|quoted|quote|less than|discount|think about it|" +
    "think it over|not interested|no thanks|send me|whatsapp|call me later|not sure|" +
    "another company|other company|competitor|out of (?:my|our) budget|risky|too much)\\b" +
    "|غالي|أرخص|ارخص|مو مهتم|مش مهتم|خصم|أفكر|افكر|ارسل|أرسل|واتساب",
  "i",
);
const QUESTION_START = new RegExp(
  "^\\s*(what|what's|whats|how|when|where|why|which|who|whose|do|does|did|is|are|can|could|" +
    "will|would|should|shall|have|has|may|any)\\b" +
    "|^\\s*(هل|كم|متى|كيف|وين|أين|اين|شو|ماذا|ليش|لماذا|ايش|إيش)",
  "i",
);

const SIGNAL = new RegExp(
  "\\b(sounds (good|great)|let'?s (do it|go ahead|proceed)|how do (i|we) (sign|pay|buy|order|start)|" +
    "when can (we|i) start|send (me )?the (contract|invoice|agreement|proposal)|where do i sign|" +
    "i'?m interested|we'?re interested|ready to (buy|sign|start|go)|book it|count me in)\\b" +
    "|متى نبدأ|كيف أدفع|كيف ادفع|ارسل العقد|أرسل العقد|موافق|نبدأ|مهتم",
  "i",
);
// Acknowledgements that carry nothing to answer: no card for these.
const FILLER =
  /^(ok(ay)?|yes|yeah|yep|no|right|sure|uh+ ?huh|mm+-?hmm+|hmm+|i see|got it|thanks?|thank you|تمام|طيب|اي|ايوه|نعم|لا|اوكي|ماشي)$/i;
const MIN_STATEMENT_WORDS = 3;

export function classify(event: TranscriptEvent): TurnKind | null {
  if (event.speaker !== "customer" || !event.final) return null;
  const text = event.text.trim();
  if (OBJECTION.test(text)) return "objection";
  if (SIGNAL.test(text)) return "signal";
  if (text.endsWith("?") || text.endsWith("؟") || QUESTION_START.test(text)) return "question";
  const words = text
    .replace(/[^\p{L}\p{N}'\s-]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const bare = words.join(" ").toLowerCase();
  if (words.length < MIN_STATEMENT_WORDS || FILLER.test(bare)) return null;
  return "statement";
}

const ANSWER = "ANSWER:";
const SAY = "SAY:";
const TIP = "TIP:";
const NO_ANSWER = "NO_SAFE_ANSWER";
const PREFIXES = [SAY, TIP, ANSWER] as const;
const MAX_CARD_WORDS = 18;
const MAX_WHY_WORDS = 12;
const MAX_BUF_CHARS = 4096;

export const DEFAULT_BANNED_OPENERS: readonly string[] = [
  "I hear you",
  "I understand your concern",
  "Great question",
  "That's a great question",
  "I completely understand",
  "أفهمك تماماً",
  "أتفهم قلقك",
  "سؤال رائع",
  "هذا سؤال رائع",
  "أفهم قلقك",
];

const SENTENCE_END = /[.!?؟](?:["'”’)]*)$/;
const LEADING_SEP = /^[\s,.:;!\-—–،؛"'“”‘’•]+/;
const WHY_SPLIT_RE = /(?:^|\n)\s*WHY:\s*/i;
const WHY_TAIL_RE = /\n[^\S\n]*(?:W(?:H(?:Y:?)?)?)?$/i;

function splitWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripBannedOpener(
  text: string,
  banned: readonly string[] = DEFAULT_BANNED_OPENERS,
): { cleaned: string; stripped: boolean } {
  const original = text.trimStart();
  let work = original;
  let stripped = false;
  const ordered = [...new Set(banned.map((p) => p.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  const patterns = ordered.map(
    (p) => new RegExp(`^\\s*${escapeRegExp(p)}(?=$|[^0-9A-Za-z_])`, "i"),
  );
  let changed = true;
  while (changed && work) {
    changed = false;
    const probe = work.replace(/^[-*•"'“‘\s]+/, "");
    for (const pat of patterns) {
      const m = pat.exec(probe);
      if (m) {
        work = probe.slice(m[0].length).replace(LEADING_SEP, "");
        stripped = true;
        changed = true;
        break;
      }
    }
  }
  let cleaned = stripped ? work : original;
  if (stripped && cleaned && /^[a-z]/.test(cleaned)) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return { cleaned, stripped };
}

export function enforceWordLimit(
  text: string,
  maxWords = MAX_CARD_WORDS,
): { text: string; cut: boolean } {
  const tokens = splitWords(text);
  if (tokens.length <= maxWords) return { text: tokens.join(" "), cut: false };
  const win = tokens.slice(0, maxWords);
  let lastSentence = -1;
  for (let i = 0; i < win.length; i += 1) {
    if (SENTENCE_END.test(win[i] ?? "")) lastSentence = i;
  }
  if (lastSentence >= 0) return { text: win.slice(0, lastSentence + 1).join(" "), cut: true };
  return { text: win.join(" "), cut: true };
}

export type Verdict = "pending" | "answer" | "no_answer";
export type CardKind = "say" | "tip" | "answer";

/** Reads "SAY: / TIP: / ANSWER:" or "NO_SAFE_ANSWER", enforces C2 limits, and preserves WHY:. */
export class VerdictParser {
  verdict: Verdict = "pending";
  kind: CardKind | null = null;
  why: string | null = null;
  cuts = 0;
  strips = 0;
  private readonly banned: readonly string[];
  private readonly maxBannedLen: number;
  private buffer = "";
  private bodyBuf = "";
  private emitted = "";
  private inWhy = false;
  private whyBuf = "";
  private openerResolved = false;
  private wordLimitHit = false;
  private capitalizeNext = false;

  constructor(opts?: { banned?: readonly string[] }) {
    this.banned = (opts?.banned ?? DEFAULT_BANNED_OPENERS).map((p) => p.trim()).filter(Boolean);
    this.maxBannedLen = this.banned.reduce((m, p) => Math.max(m, p.length), 0);
  }

  private couldBePrefix(head: string): boolean {
    const up = head.toUpperCase();
    return PREFIXES.some((p) => p.startsWith(up)) || NO_ANSWER.startsWith(up);
  }

  private couldBeBanned(text: string): boolean {
    if (!this.banned.length) return false;
    const low = text
      .trimStart()
      .replace(/^[-*•"'“‘\s]+/, "")
      .toLowerCase();
    if (!low) return true;
    if (low.length > this.maxBannedLen + 2) return false;
    return this.banned.some((p) => p.toLowerCase().startsWith(low));
  }

  private emitSafeDelta(incoming: string): string {
    if (this.inWhy) {
      if (this.whyBuf.length < MAX_BUF_CHARS) {
        this.whyBuf += incoming.slice(0, MAX_BUF_CHARS - this.whyBuf.length);
      }
      return "";
    }
    let next = incoming;
    if (this.capitalizeNext && next) {
      const trimmed = next.replace(LEADING_SEP, "");
      if (trimmed) {
        next = /^[a-z]/.test(trimmed)
          ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
          : trimmed;
        this.capitalizeNext = false;
      } else {
        next = "";
      }
    }
    if (next && this.bodyBuf.length < MAX_BUF_CHARS) {
      this.bodyBuf += next.slice(0, MAX_BUF_CHARS - this.bodyBuf.length);
    }
    const whyMatch = WHY_SPLIT_RE.exec(this.bodyBuf);
    if (whyMatch) {
      this.inWhy = true;
      this.whyBuf = this.bodyBuf.slice(whyMatch.index + whyMatch[0].length, MAX_BUF_CHARS);
      this.bodyBuf = this.bodyBuf.slice(0, whyMatch.index);
      return this.flushMain(true);
    }
    if (!this.openerResolved) {
      if (this.couldBeBanned(this.bodyBuf)) return "";
      const { cleaned, stripped } = stripBannedOpener(this.bodyBuf, this.banned);
      if (stripped) {
        this.strips += 1;
        if (!cleaned) this.capitalizeNext = true;
      }
      this.bodyBuf = cleaned;
      this.openerResolved = true;
    }
    return this.flushMain(false);
  }

  private flushMain(final: boolean): string {
    if (this.wordLimitHit) return "";
    if (!this.openerResolved) {
      const { cleaned, stripped } = stripBannedOpener(this.bodyBuf, this.banned);
      if (stripped) this.strips += 1;
      this.bodyBuf = cleaned;
      this.openerResolved = true;
    }
    let candidate = this.bodyBuf;
    candidate = final ? candidate.replace(/\r?\n+$/, "") : candidate.replace(WHY_TAIL_RE, "");
    const tokens = splitWords(candidate);
    let target: string;
    if (tokens.length > MAX_CARD_WORDS) {
      const limited = enforceWordLimit(candidate, MAX_CARD_WORDS);
      this.cuts += 1;
      this.wordLimitHit = true;
      target = limited.text;
    } else {
      target = !this.emitted ? candidate.trimStart() : candidate;
    }
    if (target.startsWith(this.emitted)) {
      const delta = target.slice(this.emitted.length);
      this.emitted = target;
      return delta;
    }
    return "";
  }

  feed(text: string): string {
    if (this.verdict === "answer") return this.emitSafeDelta(text);
    if (this.verdict === "no_answer") return "";
    if (this.buffer.length < MAX_BUF_CHARS) {
      this.buffer += text.slice(0, MAX_BUF_CHARS - this.buffer.length);
    }
    const head = this.buffer.trimStart();
    const headUp = head.toUpperCase();
    if (headUp.startsWith(NO_ANSWER)) {
      this.verdict = "no_answer";
      return "";
    }
    for (const [prefix, kind] of [
      [SAY, "say"],
      [TIP, "tip"],
      [ANSWER, "answer"],
    ] as const) {
      if (headUp.startsWith(prefix)) {
        this.verdict = "answer";
        this.kind = kind;
        return this.emitSafeDelta(head.slice(prefix.length));
      }
    }
    if (head.length >= NO_ANSWER.length || !this.couldBePrefix(head)) {
      this.verdict = "answer";
      this.kind = "answer";
      return this.emitSafeDelta(head);
    }
    return "";
  }

  finish(): string {
    let out = "";
    if (this.verdict === "pending") {
      const head = this.buffer.trim();
      if (!head || this.couldBePrefix(head)) {
        this.verdict = "no_answer";
        return "";
      }
      this.verdict = "answer";
      this.kind = "answer";
      out += this.emitSafeDelta(head);
    }
    if (this.verdict !== "answer") return "";
    out += this.flushMain(true);
    if (!this.emitted.trim()) {
      this.verdict = "no_answer";
      return "";
    }
    if (this.whyBuf.trim()) {
      const whyLim = enforceWordLimit(this.whyBuf, MAX_WHY_WORDS);
      if (whyLim.cut) this.cuts += 1;
      this.why = whyLim.text || null;
      if (this.why) out += `\nWHY: ${this.why}`;
    }
    return out;
  }
}

const VARIABLE = /{{\s*([a-z0-9_.]+)\s*}}/g;

/** Prompt template render ({{name}}), as sotto_worker/prompts/registry.py. */
export function renderPrompt(body: string, variables: Record<string, string>): string {
  const missing = new Set<string>();
  for (const m of body.matchAll(VARIABLE)) {
    const name = m[1] as string;
    if (!(name in variables)) missing.add(name);
  }
  if (missing.size)
    throw new Error(`missing prompt variable(s): ${[...missing].sort().join(", ")}`);
  return body.replace(VARIABLE, (_m, name: string) => variables[name] ?? "");
}

export function questionHash(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
