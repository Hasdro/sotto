/** D-034: the learning packet is minimised: rated cards with the customer turn before and after,
 * the summary and the brief; never the whole transcript, never the agent's words. */
import type { DeviceEntry } from "../../lib/deviceHistory";
import type { RatedCard } from "../rating/ratings";
import { buildPacket } from "./packet";

const line = (speaker: "customer" | "agent", text: string): DeviceEntry => ({
  kind: "line",
  speaker,
  text,
  at_ms: 0,
});
const card = (text: string): DeviceEntry => ({
  kind: "card",
  type: "answer",
  source: "ai",
  text,
  at_ms: 0,
});
const rated = (text: string, rating: "up" | "down", reasons: RatedCard["reasons"] = []) =>
  ({ cardId: text, callId: "c", type: "answer", source: "ai", text, rating, reasons }) as RatedCard;

const transcript: DeviceEntry[] = [
  line("customer", "Hi, I saw your ad."),
  line("agent", "AGENT-SECRET greeting"),
  line("customer", "How much is the gold plan?"),
  card("The gold plan is our most popular choice."),
  line("agent", "AGENT-SECRET reply"),
  line("customer", "That sounds expensive."),
  card("Ask what budget they had in mind."),
  line("customer", "Maybe 200 a month."),
  line("customer", "UNRELATED-MIDDLE chatter about weather."),
  line("customer", "UNRELATED-MIDDLE more chatter."),
  card("Unrated card text."),
  line("customer", "When can we start?"),
  card("Offer to book the start date now."),
  line("customer", "Great, see you then."),
  line("customer", "UNRELATED-END goodbye."),
];

describe("learning packet", () => {
  const packet = buildPacket({
    summary: "Customer asked about price and start date.",
    brief: "Lead from the website; budget unknown.",
    transcript,
    ratings: [
      rated("The gold plan is our most popular choice.", "down", ["wrong"]),
      rated("Ask what budget they had in mind.", "up", ["good_phrasing"]),
      rated("Offer to book the start date now.", "down", ["too_long", "not_our_style"]),
    ],
  });

  it("carries each rated card with the customer turn before and after", () => {
    expect(packet).toContain('customer before: "How much is the gold plan?"');
    expect(packet).toContain('customer after: "That sounds expensive."');
    expect(packet).toContain('customer before: "That sounds expensive."');
    expect(packet).toContain('customer after: "Maybe 200 a month."');
    expect(packet).toContain("rating: not helpful (too long, not our style)");
    expect(packet).toContain('customer after: "Great, see you then."');
    expect(packet).toContain("rating: helpful (good phrasing)");
    expect(packet).toContain("Summary: Customer asked about price and start date.");
    expect(packet).toContain("Prep brief: Lead from the website; budget unknown.");
  });

  it("never contains the full transcript, the agent's words or unrated cards", () => {
    expect(packet).not.toContain("AGENT-SECRET");
    expect(packet).not.toContain("UNRELATED-MIDDLE");
    expect(packet).not.toContain("UNRELATED-END");
    expect(packet).not.toContain("Unrated card text.");
    expect(packet).not.toContain("Hi, I saw your ad.");
  });

  it("stays small however long the call was", () => {
    const long = Array.from({ length: 400 }, (_, i) =>
      line("customer", `turn ${i} ${"x".repeat(500)}`),
    );
    const p = buildPacket({
      summary: "s".repeat(5000),
      brief: "b".repeat(5000),
      transcript: [...long, card("A card."), ...long],
      ratings: [rated("A card.", "up"), rated("Missing.", "down"), rated("Missing 2.", "down")],
    });
    expect(p.length).toBeLessThan(3500);
    expect(p).toContain('customer before: "-"'); // a card not found in the call has no turns
  });
});
