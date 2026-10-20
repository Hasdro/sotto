import type { CardMessage } from "@sotto/shared";
import {
  type CardsAction,
  type CardsState,
  cardsReducer,
  initialCardsState,
  MAX_CARDS,
  selectCards,
} from "./reducer";

const CALL = "0b8f3c1e-7a2d-4e6f-8c9b-1d2e3f4a5b6c";
const A = "6f1c2a52-3b7e-4d0a-9a51-0c3f8e2b7d11";
const B = "6f1c2a52-3b7e-4d0a-9a51-0c3f8e2b7d12";
const H = "6f1c2a52-3b7e-4d0a-9a51-0c3f8e2b7d13";
const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";

function msg(
  over: Partial<CardMessage> & Pick<CardMessage, "card_id" | "seq" | "delta">,
): CardMessage {
  return { v: 1, call_id: CALL, type: "answer", source: "playbook", done: false, ...over };
}

const card = (m: CardMessage, now = 0): CardsAction => ({ type: "card", card: m, now });

function run(actions: CardsAction[], from: CardsState = initialCardsState): CardsState {
  return actions.reduce(cardsReducer, from);
}

describe("cardsReducer", () => {
  it("renders the first delta immediately", () => {
    const s = run([card(msg({ card_id: A, seq: 0, delta: "Ask what" }))]);
    const [first] = selectCards(s);
    expect(first?.text).toBe("Ask what");
    expect(first?.done).toBe(false);
  });

  it("appends deltas in seq order", () => {
    const s = run([
      card(msg({ card_id: A, seq: 0, delta: "Ask " })),
      card(msg({ card_id: A, seq: 1, delta: "what " })),
      card(msg({ card_id: A, seq: 2, delta: "it includes." })),
    ]);
    expect(selectCards(s)[0]?.text).toBe("Ask what it includes.");
  });

  it("orders out-of-order deltas by seq", () => {
    const s = run([
      card(msg({ card_id: A, seq: 2, delta: "C" })),
      card(msg({ card_id: A, seq: 0, delta: "A" })),
      card(msg({ card_id: A, seq: 1, delta: "B" })),
    ]);
    expect(selectCards(s)[0]?.text).toBe("ABC");
  });

  it("shows a late first delta at once even when seq 0 never arrives", () => {
    const s = run([card(msg({ card_id: A, seq: 3, delta: "partial" }))]);
    expect(selectCards(s)[0]?.text).toBe("partial");
  });

  it("dedupes on (card_id, seq), keeping the first copy and the same state object", () => {
    const s1 = run([card(msg({ card_id: A, seq: 0, delta: "one" }))]);
    const s2 = cardsReducer(s1, card(msg({ card_id: A, seq: 0, delta: "other" })));
    expect(s2).toBe(s1);
    expect(selectCards(s2)[0]?.text).toBe("one");
  });

  it("does not dedupe the same seq across different cards", () => {
    const s = run([
      card(msg({ card_id: A, seq: 0, delta: "a" })),
      card(msg({ card_id: B, seq: 0, delta: "b" })),
    ]);
    expect(selectCards(s).map((c) => c.text)).toEqual(["b", "a"]);
  });

  it("closes a card on done: true", () => {
    const s = run([
      card(msg({ card_id: A, seq: 0, delta: "Hi" })),
      card(msg({ card_id: A, seq: 1, delta: " there.", done: true })),
    ]);
    expect(selectCards(s)[0]).toMatchObject({ text: "Hi there.", done: true, doneSeq: 1 });
  });

  it("accepts a late delta that fills a gap before the close, ignores one after it", () => {
    const s = run([
      card(msg({ card_id: A, seq: 0, delta: "A" })),
      card(msg({ card_id: A, seq: 2, delta: "C", done: true })),
      card(msg({ card_id: A, seq: 1, delta: "B" })),
      card(msg({ card_id: A, seq: 3, delta: "X" })),
    ]);
    expect(selectCards(s)[0]).toMatchObject({ text: "ABC", done: true });
  });

  it("a done with a lower seq than chunks already shown never deletes shown text", () => {
    const s = run([
      card(msg({ card_id: A, seq: 0, delta: "A" })),
      card(msg({ card_id: A, seq: 5, delta: "Z" })),
      card(msg({ card_id: A, seq: 1, delta: "B", done: true })),
    ]);
    expect(selectCards(s)[0]).toMatchObject({ text: "ABZ", done: true });
    // Nothing numbered after the highest shown seq is accepted once closed.
    const s2 = cardsReducer(s, card(msg({ card_id: A, seq: 6, delta: "late" })));
    expect(s2).toBe(s);
  });

  it("fixes a card's type and source at its first delta", () => {
    const s = run([
      card(msg({ card_id: A, seq: 0, delta: "x", type: "answer", source: "playbook" })),
      card(msg({ card_id: A, seq: 1, delta: "y", type: "warning", source: "ai" })),
    ]);
    expect(selectCards(s)[0]).toMatchObject({ type: "answer", source: "playbook", text: "xy" });
  });

  it("a single done message is a complete card", () => {
    const s = run([
      card(
        msg({
          card_id: H,
          seq: 0,
          delta: "Let me confirm.",
          type: "holding",
          source: "holding",
          done: true,
        }),
      ),
    ]);
    expect(selectCards(s)[0]).toMatchObject({ type: "holding", done: true });
  });

  it("lists the newest card first", () => {
    const s = run([
      card(msg({ card_id: A, seq: 0, delta: "first" })),
      card(msg({ card_id: B, seq: 0, delta: "second" })),
      card(msg({ card_id: A, seq: 1, delta: " more" })),
    ]);
    expect(selectCards(s).map((c) => c.id)).toEqual([B, A]);
  });

  it("keeps a label that only arrives on a later delta", () => {
    const s = run([
      card(msg({ card_id: A, seq: 0, delta: "x", source: "ai" })),
      card(
        msg({ card_id: A, seq: 1, delta: "y", source: "ai", label: "Not in playbook", done: true }),
      ),
      card(msg({ card_id: A, seq: 0, delta: "dup" })),
    ]);
    expect(selectCards(s)[0]?.label).toBe("Not in playbook");
  });

  it("keeps the timing once it arrives", () => {
    const timing = { turn_end_ms: 1, stt_final_ms: 2, lookup_ms: 3, first_token_ms: 4 };
    const s = run([
      card(msg({ card_id: A, seq: 0, delta: "x", timing })),
      card(msg({ card_id: A, seq: 1, delta: "y", timing: null })),
    ]);
    expect(selectCards(s)[0]?.timing).toEqual(timing);
  });

  describe("holding cards (R2)", () => {
    const holding = msg({
      card_id: H,
      seq: 0,
      delta: "Let me confirm that.",
      type: "holding",
      source: "holding",
      done: true,
    });

    it("a newer card in the same turn replaces the holding card", () => {
      const s = run([
        { type: "turn_end", now: 0 },
        card(holding, 1400),
        card(msg({ card_id: A, seq: 0, delta: "It is included.", source: "ai" }), 1600),
      ]);
      expect(selectCards(s).map((c) => c.id)).toEqual([A]);
      expect(s.retired[H]).toBe(true);
    });

    it("late deltas of a replaced holding card stay dropped", () => {
      const s = run([
        { type: "turn_end", now: 0 },
        card({ ...holding, done: false }),
        card(msg({ card_id: A, seq: 0, delta: "Answer" })),
        card({ ...holding, seq: 1, delta: " more" }),
      ]);
      expect(selectCards(s).map((c) => c.id)).toEqual([A]);
    });

    it("a holding card from an earlier turn is not replaced", () => {
      const s = run([
        { type: "turn_end", now: 0 },
        card(holding),
        { type: "turn_end", now: 10 },
        card(msg({ card_id: A, seq: 0, delta: "Next answer" })),
      ]);
      expect(selectCards(s).map((c) => c.id)).toEqual([A, H]);
    });

    it("a holding card after a real card of the same turn is dropped", () => {
      const s = run([
        { type: "turn_end", now: 0 },
        card(msg({ card_id: A, seq: 0, delta: "Answer" })),
        card(holding),
      ]);
      expect(selectCards(s).map((c) => c.id)).toEqual([A]);
    });

    it("a card whose source is holding counts as holding", () => {
      const s = run([
        { type: "turn_end", now: 0 },
        card(msg({ card_id: H, seq: 0, delta: "Hold", source: "holding", type: "answer" })),
        card(msg({ card_id: A, seq: 0, delta: "Real" })),
      ]);
      expect(selectCards(s).map((c) => c.id)).toEqual([A]);
    });

    it("keys turns by turn_id: a late answer replaces its own holding card, the next holding card stays", () => {
      const H1 = H;
      const H2 = "6f1c2a52-3b7e-4d0a-9a51-0c3f8e2b7d14";
      const s = run([
        { type: "turn_end", now: 0, turnId: T1 },
        card({ ...holding, card_id: H1, turn_id: T1 }, 1400),
        { type: "turn_end", now: 3000, turnId: T2 },
        card(msg({ card_id: A, seq: 0, delta: "Late answer", source: "ai", turn_id: T1 }), 3500),
        card({ ...holding, card_id: H2, turn_id: T2 }, 4400),
      ]);
      expect(selectCards(s).map((c) => c.id)).toEqual([H2, A]);
      expect(s.retired[H1]).toBe(true);
    });

    it("never drops a holding card for a turn that has no answer yet", () => {
      const s = run([
        { type: "turn_end", now: 0, turnId: T1 },
        card(msg({ card_id: A, seq: 0, delta: "Answer", turn_id: T1 })),
        { type: "turn_end", now: 10, turnId: T2 },
        card({ ...holding, turn_id: T2 }),
      ]);
      expect(selectCards(s).map((c) => c.id)).toEqual([H, A]);
    });

    it("a holding card whose turn_id already has an answer is dropped", () => {
      const s = run([
        { type: "turn_end", now: 0, turnId: T1 },
        card(msg({ card_id: A, seq: 0, delta: "Answer", turn_id: T1 })),
        { type: "turn_end", now: 10, turnId: T2 },
        card({ ...holding, turn_id: T1 }),
      ]);
      expect(selectCards(s).map((c) => c.id)).toEqual([A]);
    });

    it("an answer with a turn_id does not replace a holding card of another turn", () => {
      const s = run([
        { type: "turn_end", now: 0, turnId: T2 },
        card({ ...holding, turn_id: T2 }),
        card(msg({ card_id: A, seq: 0, delta: "Answer", turn_id: T1 })),
      ]);
      expect(selectCards(s).map((c) => c.id)).toEqual([A, H]);
    });

    it("two real cards in one turn both stay", () => {
      const s = run([
        { type: "turn_end", now: 0 },
        card(msg({ card_id: A, seq: 0, delta: "One" })),
        card(msg({ card_id: B, seq: 0, delta: "Two", type: "question" })),
      ]);
      expect(selectCards(s).map((c) => c.id)).toEqual([B, A]);
    });
  });

  describe("delay from the end of the customer's turn (R1)", () => {
    it("records first-delta time minus turn_end time", () => {
      const s = run([
        { type: "turn_end", now: 1000 },
        card(msg({ card_id: A, seq: 0, delta: "x" }), 1840),
        card(msg({ card_id: A, seq: 1, delta: "y" }), 2500),
      ]);
      expect(selectCards(s)[0]).toMatchObject({ shownAfterMs: 840, firstSeenAt: 1840 });
    });

    it("is unknown before any turn_end", () => {
      const s = run([card(msg({ card_id: A, seq: 0, delta: "x" }), 50)]);
      expect(selectCards(s)[0]?.shownAfterMs).toBeNull();
    });

    it("without turn_id, assigns cards to the turn counted from turn_end events", () => {
      const s = run([
        { type: "turn_end", now: 0 },
        { type: "turn_end", now: 5 },
        card(msg({ card_id: A, seq: 0, delta: "x" }), 6),
      ]);
      expect(selectCards(s)[0]?.turnKey).toBe("n:2");
    });

    it("with turn_id, measures from the turn_end of that turn, not the latest one", () => {
      const s = run([
        { type: "turn_end", now: 1000, turnId: T1 },
        { type: "turn_end", now: 3000, turnId: T2 },
        card(msg({ card_id: A, seq: 0, delta: "late", turn_id: T1 }), 3500),
      ]);
      expect(selectCards(s)[0]).toMatchObject({ turnKey: T1, shownAfterMs: 2500 });
    });

    it("on-device calls: uses the card's own delay from the end of speech when it is longer", () => {
      // The engine on this device sends turn_end and the card in the same instant, so the
      // client-side gap is ~0; the card's timing knows when the customer actually stopped.
      const timing = { turn_end_ms: 0, stt_final_ms: 420, lookup_ms: 2, first_token_ms: 610 };
      const s = run([
        { type: "turn_end", now: 1000, turnId: T1 },
        card(msg({ card_id: A, seq: 0, delta: "x", turn_id: T1, timing }), 1000),
      ]);
      expect(selectCards(s)[0]?.shownAfterMs).toBe(610);
    });

    it("server calls: keeps the client-measured delay when it is the longer one", () => {
      const timing = { turn_end_ms: 0, stt_final_ms: 0, lookup_ms: 2, first_token_ms: 300 };
      const s = run([
        { type: "turn_end", now: 1000, turnId: T1 },
        card(msg({ card_id: A, seq: 0, delta: "x", turn_id: T1, timing }), 1900),
      ]);
      expect(selectCards(s)[0]?.shownAfterMs).toBe(900);
    });

    it("with an unknown turn_id the delay is unknown", () => {
      const s = run([card(msg({ card_id: A, seq: 0, delta: "x", turn_id: T2 }), 10)]);
      expect(selectCards(s)[0]?.shownAfterMs).toBeNull();
    });
  });

  it(`keeps at most ${MAX_CARDS} cards and ignores deltas for evicted ones`, () => {
    const ids = Array.from(
      { length: MAX_CARDS + 2 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    let s = run(ids.map((id) => card(msg({ card_id: id, seq: 0, delta: id }))));
    expect(s.order).toHaveLength(MAX_CARDS);
    const oldest = ids[0] as string;
    expect(s.byId[oldest]).toBeUndefined();
    s = cardsReducer(s, card(msg({ card_id: oldest, seq: 1, delta: "late" })));
    expect(s.byId[oldest]).toBeUndefined();
  });

  it("reset clears everything", () => {
    const s = run([
      { type: "turn_end", now: 0 },
      card(msg({ card_id: A, seq: 0, delta: "x" })),
      { type: "reset" },
    ]);
    expect(s).toEqual(initialCardsState);
  });
});
