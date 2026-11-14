import type { DeviceEntry } from "../../lib/deviceHistory";
import type { RatedCard } from "../rating/ratings";
import { buildSignals } from "./signals";

const line = (speaker: "customer" | "agent", text: string): DeviceEntry => ({
  kind: "line",
  speaker,
  text,
  at_ms: 0,
});
const card = (type: string, text: string): DeviceEntry => ({
  kind: "card",
  type,
  source: "ai",
  text,
  at_ms: 0,
});
const rated = (text: string, rating: "up" | "down"): RatedCard => ({
  cardId: text,
  callId: "c1",
  type: "answer",
  source: "ai",
  text,
  rating,
  reasons: [],
});

describe("coaching signals (INT-05, INT-15)", () => {
  const transcript = [
    line("customer", "That is too expensive for us."),
    card("objection", "Offer the yearly plan."),
    line("agent", "I hear you, my own words never leave."),
    line("customer", "Do you offer a warranty on the panels?"),
    card("answer", "Yes, ten years."),
    line("customer", "And installation time?"),
    card("answer", "Two weeks."),
  ];

  it("sends objection themes and the question before each 'not helpful' card, never agent words", () => {
    const s = buildSignals("c1", transcript, [
      rated("Yes, ten years.", "down"),
      rated("Two weeks.", "up"),
    ]);
    expect(s).toEqual({
      call_id: "c1",
      objections: ["price"],
      not_helpful: [{ question: "Do you offer a warranty on the panels?" }],
    });
    expect(JSON.stringify(s)).not.toContain("my own words");
  });

  it("sends nothing for a quiet call", () => {
    expect(buildSignals("c2", [line("customer", "Hello")], [])).toBeNull();
  });
});
