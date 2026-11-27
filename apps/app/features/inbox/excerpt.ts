/**
 * UI-011: what was said before an unanswered question, as turns. The engine writes one
 * "Customer: …" / "Agent: …" line per turn (packages/engine session.ts `context`); speech-to-text
 * sometimes repeats a line, so a turn equal to the one before it is kept once. The Inbox shows
 * the last EXCERPT_SHOWN turns and the rest behind a toggle.
 */
/** `at`: the turn's place in the whole excerpt (a stable React key: turns can repeat). */
export type ExcerptTurn = { at: number; speaker: "customer" | "agent" | null; text: string };

export const EXCERPT_SHOWN = 3;

export function excerptTurns(excerpt: string): ExcerptTurn[] {
  const out: ExcerptTurn[] = [];
  for (const raw of excerpt.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(Customer|Agent):\s*(.*)$/.exec(line);
    const at = out.length;
    const turn: ExcerptTurn = m
      ? { at, speaker: m[1] === "Customer" ? "customer" : "agent", text: (m[2] ?? "").trim() }
      : { at, speaker: null, text: line };
    const before = out.at(-1);
    if (before && before.speaker === turn.speaker && before.text === turn.text) continue;
    out.push(turn);
  }
  return out;
}
