/**
 * Trigger rules and the verdict parser, ported from sotto_worker/pipeline/trigger.py and
 * verdict.py. R4: only final customer turns can trigger a card.
 */
import type { TranscriptEvent } from "./types.ts";

export type TurnKind = "question" | "objection";

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

export function classify(event: TranscriptEvent): TurnKind | null {
  if (event.speaker !== "customer" || !event.final) return null;
  const text = event.text.trim();
  if (OBJECTION.test(text)) return "objection";
  if (text.endsWith("?") || text.endsWith("؟") || QUESTION_START.test(text)) return "question";
  return null;
}

const ANSWER = "ANSWER:";
const NO_ANSWER = "NO_SAFE_ANSWER";
export type Verdict = "pending" | "answer" | "no_answer";

/** Reads the leading "ANSWER: …" / "NO_SAFE_ANSWER" before anything reaches the agent. */
export class VerdictParser {
  verdict: Verdict = "pending";
  private buffer = "";
  private shown = false;

  private show(text: string): string {
    let out = text;
    if (!this.shown) {
      out = out.replace(/^\s+/, "");
      this.shown = out.length > 0;
    }
    return out;
  }

  feed(text: string): string {
    if (this.verdict === "answer") return this.show(text);
    if (this.verdict === "no_answer") return "";
    this.buffer += text;
    const head = this.buffer.replace(/^\s+/, "");
    if (head.startsWith(NO_ANSWER)) {
      this.verdict = "no_answer";
      return "";
    }
    if (head.startsWith(ANSWER)) {
      this.verdict = "answer";
      return this.show(head.slice(ANSWER.length));
    }
    if (
      head.length >= NO_ANSWER.length ||
      !(ANSWER.startsWith(head) || NO_ANSWER.startsWith(head))
    ) {
      this.verdict = "answer"; // the model ignored the format: its words are the answer
      return this.show(head);
    }
    return "";
  }

  finish(): string {
    if (this.verdict !== "pending") return "";
    const head = this.buffer.trim();
    if (!head || ANSWER.startsWith(head) || NO_ANSWER.startsWith(head)) {
      this.verdict = "no_answer";
      return "";
    }
    this.verdict = "answer";
    return this.show(head);
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
