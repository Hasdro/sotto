/**
 * Playbook lookup: TF-IDF cosine over question + tags (twice), the same as
 * sotto_worker/playbook/index.py so both engines pick the same entry (playbook.test.ts checks
 * the demo questions against the worker's answers).
 */
import type { PlaybookEntry } from "./types.ts";

const WORD = /[a-z0-9]+|[؀-ۿ]+/g;
const STOPWORDS = new Set(
  (
    "a an and are as at be but by can could do does for from had has have how i i'm if in is it " +
    "it's its just like me my of on or our so that the their them then there they this to us was " +
    "we what what's when where which who why will with would you your honestly really actually " +
    "please okay ok well"
  ).split(" "),
);
/** Minimum cosine similarity for a high-confidence playbook answer (R2 step 1). */
export const CONFIDENT = 0.42;

export function tokens(text: string): string[] {
  const out: string[] = [];
  for (let word of text.toLowerCase().replaceAll("'", "").match(WORD) ?? []) {
    if (STOPWORDS.has(word)) continue;
    if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) word = word.slice(0, -1);
    out.push(word);
  }
  return out;
}

type Vector = Map<string, number>;

export type PlaybookHit = { entry: PlaybookEntry; score: number };

export class PlaybookIndex {
  private readonly idf = new Map<string, number>();
  private readonly vectors: Vector[];

  readonly entries: PlaybookEntry[];

  constructor(entries: PlaybookEntry[]) {
    this.entries = entries;
    const docs = entries.map((e) => {
      const tagTokens = tokens(e.tags.join(" "));
      return [...tokens(e.question), ...tagTokens, ...tagTokens];
    });
    const df = new Map<string, number>();
    for (const doc of docs) for (const t of new Set(doc)) df.set(t, (df.get(t) ?? 0) + 1);
    const n = Math.max(docs.length, 1);
    for (const [t, c] of df) this.idf.set(t, Math.log((1 + n) / (1 + c)) + 1);
    this.vectors = docs.map((d) => this.vector(d));
  }

  private vector(toks: string[]): Vector {
    const counts = new Map<string, number>();
    for (const t of toks) counts.set(t, (counts.get(t) ?? 0) + 1);
    const vec: Vector = new Map();
    for (const [t, c] of counts) vec.set(t, c * (this.idf.get(t) ?? 0));
    let norm = 0;
    for (const v of vec.values()) norm += v * v;
    norm = Math.sqrt(norm) || 1;
    for (const [t, v] of vec) vec.set(t, v / norm);
    return vec;
  }

  /** The `n` best-scoring entries, best first, whatever their confidence. */
  ranked(text: string, n: number): PlaybookHit[] {
    const query = this.vector(tokens(text));
    const hits = this.entries.map((entry, i) => {
      const vec = this.vectors[i] as Vector;
      let score = 0;
      for (const [t, w] of query) score += w * (vec.get(t) ?? 0);
      return { entry, score };
    });
    // Stable sort: on a tie the earlier entry wins, as the single-best scan did.
    return hits.sort((a, b) => b.score - a.score).slice(0, n);
  }

  /** Best match regardless of confidence (null only for an empty playbook). */
  nearest(text: string): PlaybookHit | null {
    return this.ranked(text, 1)[0] ?? null;
  }

  lookup(text: string): PlaybookHit | null {
    const hit = this.nearest(text);
    return hit !== null && hit.score >= CONFIDENT ? hit : null;
  }
}

/** How much playbook text the model gets in `playbook.match` (T-032). */
export const MATCH_MAX_CHARS = 600;
/** How many near entries the model sees when none is a confident match (T-032). */
export const NEAR_ENTRIES = 3;

/** The entries the model may draw on: question, short answer and details each, best first,
 * capped at `max` characters so the prompt (and its first token) stays small. */
export function matchText(hits: PlaybookHit[], max = MATCH_MAX_CHARS): string {
  let out = "";
  for (const { entry } of hits) {
    const piece = [entry.question, entry.short_answer, entry.details]
      .map((s) => s.trim())
      .filter(Boolean)
      .join("\n");
    const sep = out ? "\n\n" : "";
    if (out.length + sep.length + piece.length <= max) {
      out += sep + piece;
      continue;
    }
    const room = max - out.length - sep.length;
    if (room > 40) out += sep + clip(piece, room);
    break;
  }
  return out;
}

function clip(text: string, max: number): string {
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${space > max / 2 ? cut.slice(0, space) : cut}…`;
}
