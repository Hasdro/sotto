import { buildReport, dayAxis, type UsageRow } from "./data";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 22, 12);
const row = (o: Partial<UsageRow>): UsageRow => ({
  id: "co:x",
  user_id: "u1",
  name: "Rania",
  started_at: NOW - DAY,
  duration_s: 120,
  cards: 4,
  playbook_cards: 2,
  ai_cards: 1,
  holding_lines: 1,
  escalations: 0,
  p50_ms: 600,
  p95_ms: 900,
  source: "zoom",
  review: null,
  ...o,
});
const review = (success: number, opening = 5) => ({
  scores: { opening, discovery: 6, listening: 7, objections: 8, clarity: 9, next_step: 4 },
  success,
  sentiment: "positive",
});

describe("reports", () => {
  it("adds up calls, minutes, cards, speed and chance to close", () => {
    const r = buildReport(
      [
        row({ review: review(40) }),
        row({ review: review(80), p50_ms: 800, source: "mic" }),
        row({ p50_ms: 1000, source: "nonsense" }),
      ],
      7,
      NOW,
    );
    expect([r.calls, r.minutes, r.cards, r.success, r.speedMs]).toEqual([3, 6, 12, 60, 800]);
    expect(r.cardSources).toEqual([
      { key: "playbook", n: 6 },
      { key: "ai", n: 3 },
      { key: "holding", n: 3 },
    ]);
    expect(r.sources).toEqual([
      { source: "zoom", calls: 1 },
      { source: "mic", calls: 1 },
      { source: "computer", calls: 1 },
    ]);
    expect(r.days).toHaveLength(7);
    expect(r.days.at(-2)?.calls).toBe(3);
  });

  it("averages skills and names each agent's trend and weakest skill", () => {
    const r = buildReport(
      [
        row({ started_at: NOW - 6 * DAY, review: review(30, 2) }),
        row({ started_at: NOW - DAY, review: review(70, 2) }),
        row({ user_id: "u2", name: "Omar", review: null }),
      ],
      7,
      NOW,
    );
    expect(r.skills.find((s) => s.skill === "opening")?.score).toBe(2);
    expect(r.agents[0]).toMatchObject({
      name: "Rania",
      calls: 2,
      success: 50,
      trend: 40,
      focus: "opening",
    });
    expect(r.agents[1]).toMatchObject({ name: "Omar", success: null, trend: null, focus: null });
  });

  it("is empty but well-formed with no calls", () => {
    const r = buildReport([], 30, NOW);
    expect([r.calls, r.success, r.speedMs, r.skills.length, r.agents.length]).toEqual([
      0,
      null,
      null,
      0,
      0,
    ]);
    expect(r.days).toHaveLength(30);
  });
});

describe("Calls per day scale (UI-009)", () => {
  it.each([
    [0, 1, [1, 0]],
    [1, 1, [1, 0]],
    [2, 2, [2, 1, 0]],
    [3, 3, [3, 0]],
    [7, 8, [8, 4, 0]],
    [11, 12, [12, 6, 0]],
    [57, 60, [60, 30, 0]],
    [130, 150, [150, 75, 0]],
  ])("busiest day %i: top %i, ticks %j", (max, top, ticks) => {
    expect(dayAxis(max)).toEqual({ top, ticks });
  });
});
