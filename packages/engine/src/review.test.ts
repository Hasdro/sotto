/** After-call review (owner, 21 Oct): checked, clamped, and never throws. */
import { describe, expect, it } from "vitest";
import { parseReview, reviewCall } from "./review.ts";
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
