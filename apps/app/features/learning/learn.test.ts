/** T-059: the learning run only starts after ≥ 3 ratings, keeps to 8 × 25 words, and sends the
 * server only the instructions. */
import type { CallBundle, ModelRouter } from "@sotto/engine";

const mockApi = jest.fn(async (..._args: unknown[]) => ({}));
const mockRefresh = jest.fn(async () => {});
let mockFeatures: Record<string, { state: string }> = {};
jest.mock("../../lib/cloud", () => ({
  cloudActive: () => true,
  cloudApi: (...args: unknown[]) => mockApi(...args),
  cloudState: () => ({ status: "signed_in", me: { features: mockFeatures } }),
  refreshFeatures: () => mockRefresh(),
}));

import { rateCard, resetRatings } from "../rating/ratings";
import { learnAfterCall, parseInstructions } from "./learn";

const bundle = {
  company: { name: "Acme" },
  prompts: {
    learned_extract: {
      key: "learned_extract",
      version: 1,
      stage: "summary",
      variables: [],
      body: "Now:\n{{learning.current}}\nMax {{learning.max_items}} for {{company.name}}\n{{call.packet}}",
    },
  },
  learned: { version: 2, instructions: ["Be brief."] },
} as unknown as CallBundle;

function routerSaying(text: string, seen: string[] = []): ModelRouter {
  return {
    async *stream(_stage: string, req: { messages: { content: string }[] }) {
      seen.push(req.messages[0]?.content ?? "");
      yield text;
    },
  } as unknown as ModelRouter;
}

const rate = (n: number) => {
  for (let i = 0; i < n; i++)
    rateCard(
      { id: `k${i}`, callId: "call-1", type: "answer", source: "ai", text: `Card ${i}.` },
      "down",
      ["too_long"],
    );
};

const run = (router: ModelRouter) =>
  learnAfterCall({
    callId: "call-1",
    router,
    bundle,
    transcript: [],
    summary: "A summary.",
    brief: "",
    now: 0,
  });

describe("parseInstructions", () => {
  it("keeps at most 8 dash lines of at most 25 words", () => {
    const many = Array.from({ length: 12 }, (_, i) => `- Rule ${i}.`).join("\n");
    expect(parseInstructions(many)).toHaveLength(8);
    expect(parseInstructions(`- ok\n- ${"word ".repeat(26)}\nprose`)).toEqual(["ok"]);
    expect(parseInstructions("NONE")).toEqual([]);
    expect(parseInstructions("I cannot help.")).toBeNull();
  });
});

describe("learnAfterCall", () => {
  beforeEach(() => {
    resetRatings();
    mockApi.mockClear();
    mockRefresh.mockClear();
    mockFeatures = {
      learned_instructions: { state: "available" },
      card_ratings: { state: "available" },
    };
  });

  it("does nothing with fewer than three ratings", async () => {
    rate(2);
    expect(await run(routerSaying("- Shorter cards."))).toBeNull();
    expect(mockApi.mock.calls.some((c) => c[0] === "/api/v1/learning/proposals")).toBe(false);
  });

  it("sends the current list and the packet to the model, and only the list to the server", async () => {
    rate(3);
    const seen: string[] = [];
    const out = await run(routerSaying("- Be brief.\n- Ask one question.", seen));
    expect(out).toEqual(["Be brief.", "Ask one question."]);
    expect(seen[0]).toContain("Now:\n- Be brief.");
    expect(seen[0]).toContain("Max 8 for Acme");
    expect(seen[0]).toContain('card: "Card 0."');
    const post = mockApi.mock.calls.find((c) => c[0] === "/api/v1/learning/proposals");
    expect(post?.[1]).toEqual({
      method: "POST",
      body: { call_id: "call-1", instructions: ["Be brief.", "Ask one question."] },
    });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("never runs when learned instructions are off", async () => {
    rate(3);
    mockFeatures = { learned_instructions: { state: "off_by_org" } };
    expect(await run(routerSaying("- X."))).toBeNull();
  });
});
