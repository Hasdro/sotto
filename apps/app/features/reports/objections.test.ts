import type { DeviceCall } from "../../lib/deviceHistory";
import { searchCalls, themeOf, topObjections } from "./objections";

const call = (id: string, lines: [string, string][], success?: number): DeviceCall => ({
  id,
  started_at: 0,
  ended_at: 1,
  title: id,
  mode: "live",
  cards: 0,
  p50_ms: null,
  p95_ms: null,
  transcript: lines.map(([kind, text]) =>
    kind === "obj"
      ? { kind: "card", type: "objection", source: "ai", text, at_ms: 0 }
      : { kind: "line", speaker: kind === "c" ? "customer" : "agent", text, at_ms: 0 },
  ),
  ...(success === undefined
    ? {}
    : {
        review: {
          scores: {
            opening: 5,
            discovery: 5,
            listening: 5,
            objections: 5,
            clarity: 5,
            next_step: 5,
          },
          success,
          sentiment: "neutral",
          summary: "",
          tip: "",
          strengths: [],
          improve: [],
        },
      }),
});

describe("objections and search", () => {
  it("names the theme of an objection", () => {
    expect(themeOf("That's too expensive for us")).toBe("price");
    expect(themeOf("Call me next month")).toBe("timing");
    expect(themeOf("I need to discuss it with my partner")).toBe("think");
    expect(themeOf("السعر غالي")).toBe("price");
    expect(themeOf("Hmm.")).toBe("other");
  });

  it("groups objections by theme with how often and how those calls went", () => {
    const calls = [
      call(
        "a",
        [
          ["c", "Too expensive."],
          ["obj", "Ask about budget"],
          ["c", "Maybe later"],
          ["obj", "x"],
        ],
        40,
      ),
      call(
        "b",
        [
          ["c", "The price is high"],
          ["obj", "y"],
          ["a", "agent words"],
        ],
        80,
      ),
    ];
    expect(topObjections(calls)).toEqual([
      { theme: "price", count: 2, success: 60, example: "Too expensive." },
      { theme: "timing", count: 1, success: 40, example: "Maybe later" },
    ]);
  });

  it("finds calls by any word said in them", () => {
    const calls = [call("a", [["c", "Do you offer a Discount?"]]), call("b", [["c", "Hello"]])];
    expect([...searchCalls(calls, "discount").entries()]).toEqual([
      ["a", "Do you offer a Discount?"],
    ]);
    expect(searchCalls(calls, "  ").size).toBe(0);
  });
});
