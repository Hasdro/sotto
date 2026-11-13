/** After-call review (owner, 21 Oct): checked, clamped, and never throws. */
import { describe, expect, it } from "vitest";
import { chanceBand, parseFollowUp, parseReview, reviewCall } from "./review.ts";
import { ModelRouter } from "./router.ts";
import { type LLMAdapter, realClock } from "./types.ts";

const GOOD = {
  scores: { opening: 8, discovery: 14, listening: -2, objections: 6.6, clarity: "7", next_step: 5 },
  success: 140,
  sentiment: "positive",
  summary: "Asked about delivery; agreed to a demo.",
  tip: "Ask about budget before the demo.",
  strengths: ["warm opening", "clear answers", "good pace", "extra"],
  improve: ["no budget question"],
};

describe("call review", () => {
  it("reads the model's JSON, even in a code fence, and clamps every number", () => {
    const r = parseReview(`Here you go:\n\`\`\`json\n${JSON.stringify(GOOD)}\n\`\`\``);
    expect(r?.scores).toEqual({
      opening: 8,
      discovery: 10,
      listening: 0,
      objections: 7,
      clarity: 7,
      next_step: 5,
    });
    expect(r?.success).toBe(100);
    expect(r?.sentiment).toBe("positive");
    expect(r?.strengths).toHaveLength(3);
  });

  it("refuses replies with no scores or no tip", () => {
    expect(parseReview("I cannot review this call.")).toBeNull();
    expect(parseReview('{"scores":{},"tip":"x"}')).toBeNull();
    expect(parseReview(JSON.stringify({ ...GOOD, tip: "" }))).toBeNull();
    expect(parseReview("{broken")).toBeNull();
  });

  const route = (reply: () => AsyncGenerator<string>) => {
    const model: LLMAdapter = { provider: "fake", model: "m", warm: async () => {}, stream: reply };
    return new ModelRouter({ summary: { provider: "fake", model: "m" } }, () => model, realClock);
  };
  const prompt = {
    key: "review",
    version: 1,
    stage: "summary",
    variables: [],
    body: "{{company.name}} {{company.call_goal}}\n{{call.transcript}}",
  };
  const company = { name: "Zylker", call_goal: "book a demo" } as Parameters<
    typeof reviewCall
  >[0]["company"];
  const lines = [{ speaker: "customer" as const, text: "Do you deliver?" }];

  it("asks the summary stage once and returns the checked review", async () => {
    const r = await reviewCall({
      router: route(async function* () {
        yield JSON.stringify(GOOD).slice(0, 20);
        yield JSON.stringify(GOOD).slice(20);
      }),
      prompt,
      company,
      lines,
      now: 0,
    });
    expect(r?.tip).toBe("Ask about budget before the demo.");
  });

  it("gives null instead of throwing when the model fails or there is nothing to review", async () => {
    const failing = route(async function* () {
      yield* [];
      throw new Error("down");
    });
    expect(await reviewCall({ router: failing, prompt, company, lines, now: 0 })).toBeNull();
    expect(
      await reviewCall({ router: failing, prompt: undefined, company, lines, now: 0 }),
    ).toBeNull();
    expect(
      await reviewCall({
        router: failing,
        prompt,
        company,
        lines: [{ speaker: "agent", text: "Hi" }],
        now: 0,
      }),
    ).toBeNull();
  });
});

describe("review v3 fields (UX-27, INT-01c, INT-02m, INT-07)", () => {
  const V3 = {
    ...GOOD,
    objections: ["price too high", "", "needs board sign-off"],
    commitments: ["send the proposal by Friday"],
    next_step: { text: "Demo with the CFO", date: "2026-11-20", time: "15:30" },
    risks: [
      { reason: "Budget not confirmed", quote: "we have not set a budget yet" },
      { reason: "", quote: "ignored" },
      { reason: "Competitor named", quote: "x".repeat(300) },
    ],
  };

  it("reads objections, commitments, the agreed next step and risk signals", () => {
    const r = parseReview(JSON.stringify(V3));
    expect(r?.objections).toEqual(["price too high", "needs board sign-off"]);
    expect(r?.commitments).toEqual(["send the proposal by Friday"]);
    expect(r?.next_step).toEqual({ text: "Demo with the CFO", date: "2026-11-20", time: "15:30" });
    expect(r?.risks).toHaveLength(2);
    expect(r?.risks?.[0]).toEqual({
      reason: "Budget not confirmed",
      quote: "we have not set a budget yet",
    });
    expect(r?.risks?.[1]?.quote.length).toBeLessThanOrEqual(120);
  });

  it("drops a malformed date or time instead of guessing, and keeps v2 replies working", () => {
    const r = parseReview(
      JSON.stringify({ ...V3, next_step: { text: "Call back", date: "next Tuesday", time: "3pm" } }),
    );
    expect(r?.next_step).toEqual({ text: "Call back", date: null, time: null });
    const v2 = parseReview(JSON.stringify(GOOD));
    expect(v2?.objections).toEqual([]);
    expect(v2?.commitments).toEqual([]);
    expect(v2?.next_step).toBeNull();
    expect(v2?.risks).toEqual([]);
  });

  it("bands the chance to close: Likely / Unclear / Unlikely", () => {
    expect(chanceBand(80)).toBe("high");
    expect(chanceBand(65)).toBe("high");
    expect(chanceBand(64)).toBe("medium");
    expect(chanceBand(35)).toBe("medium");
    expect(chanceBand(34)).toBe("low");
    expect(chanceBand(0)).toBe("low");
  });
});

describe("follow-up email", () => {
  it("splits the subject from the body, and keeps a reply without a subject", () => {
    expect(parseFollowUp("SUBJECT: Your quote\nHi Sara,\nThanks for your time.")).toEqual({
      subject: "Your quote",
      body: "Hi Sara,\nThanks for your time.",
    });
    expect(parseFollowUp("Hi Sara, thanks.")).toEqual({ subject: "", body: "Hi Sara, thanks." });
    expect(parseFollowUp("   ")).toBeNull();
  });
});
