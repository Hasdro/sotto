import { selectCards } from "../cards/reducer";
import { decodeServerFrame } from "./bridge";
import { connectMockBridge, mockHello, scriptFrames, toDeltas } from "./mock-stream";
import { initialSessionState, sessionReducer } from "./session";

describe("dev-only mock stream", () => {
  it.each(["en", "ar"] as const)("every %s frame is a valid protocol message", (locale) => {
    for (const f of [{ data: mockHello(locale) }, ...scriptFrames(locale)]) {
      expect(decodeServerFrame(JSON.stringify(f.data))).not.toBeNull();
    }
  });

  it("splits text into deltas that join back to the text", () => {
    const text = "Ask what their quote includes, then offer a comparison.";
    expect(toDeltas(text).join("")).toBe(text);
    expect(toDeltas(text).length).toBeGreaterThan(1);
  });

  it("replays through the session reducer to a call with cards, a replaced holding line and an escalation", () => {
    jest.useFakeTimers();
    let state = initialSessionState;
    const bridge = connectMockBridge(
      {
        onStatus: (status) => {
          state = sessionReducer(state, { type: "connection", status });
        },
        onMessage: (msg) => {
          state = sessionReducer(state, { type: "server", msg, now: Date.now() });
        },
      },
      { locale: "en", autostart: true },
    );
    jest.runAllTimers();
    const cards = selectCards(state.cards);
    expect(state.phase).toBe("live");
    expect(cards.map((c) => c.type)).toEqual(["answer", "objection", "holding", "answer"]);
    expect(cards[0]).toMatchObject({ source: "ai", done: true });
    expect(state.escalations).toHaveLength(1);
    bridge.send({ type: "end" });
    jest.runAllTimers();
    expect(state.phase).toBe("ended");
    bridge.close();
    jest.useRealTimers();
  });
});
