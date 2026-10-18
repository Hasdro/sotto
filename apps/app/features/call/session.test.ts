import type { DemoServerMessage } from "@sotto/shared";
import { selectCards } from "../cards/reducer";
import {
  initialSessionState,
  type SessionAction,
  type SessionState,
  sessionReducer,
} from "./session";

const CALL = "0b8f3c1e-7a2d-4e6f-8c9b-1d2e3f4a5b6c";
const OTHER = "0b8f3c1e-7a2d-4e6f-8c9b-000000000000";
const CARD = "6f1c2a52-3b7e-4d0a-9a51-0c3f8e2b7d11";

const server = (msg: DemoServerMessage, now = 0): SessionAction => ({ type: "server", msg, now });
const run = (actions: SessionAction[], from: SessionState = initialSessionState) =>
  actions.reduce(sessionReducer, from);

const hello: DemoServerMessage = {
  type: "hello",
  v: 1,
  company_name: "Palm Grove Realty (demo)",
  mode: "live",
  scenarios: [{ id: "price-objection", title: "Price objection" }],
};
const started: DemoServerMessage = { type: "call_started", call_id: CALL };
const cardMsg = (call_id = CALL, seq = 0): DemoServerMessage => ({
  type: "card",
  card: {
    v: 1,
    card_id: CARD,
    call_id,
    seq,
    type: "answer",
    source: "playbook",
    delta: "Hi",
    done: false,
  },
});

describe("sessionReducer", () => {
  it("starts connecting, idle, with nothing to show", () => {
    expect(initialSessionState).toMatchObject({
      connection: "connecting",
      phase: "idle",
      hello: null,
    });
  });

  it("hello opens the connection and stores company, mode and scenarios", () => {
    const s = run([server(hello)]);
    expect(s.connection).toBe("open");
    expect(s.hello?.mode).toBe("live");
    expect(s.hello?.scenarios).toHaveLength(1);
  });

  it("goes offline and back on connection events, keeping the same object when unchanged", () => {
    const s1 = run([{ type: "connection", status: "offline" }]);
    expect(s1.connection).toBe("offline");
    expect(sessionReducer(s1, { type: "connection", status: "offline" })).toBe(s1);
  });

  it("stays offline during a reconnect attempt until hello arrives", () => {
    const offline = run([{ type: "connection", status: "offline" }]);
    expect(sessionReducer(offline, { type: "connection", status: "connecting" })).toBe(offline);
    expect(sessionReducer(offline, server(hello)).connection).toBe("open");
  });

  it("call_started resets the call and goes live", () => {
    const s = run([server(hello), server(started, 100), server(cardMsg()), server(started, 200)]);
    expect(s).toMatchObject({ phase: "live", callId: CALL, startedAt: 200 });
    expect(selectCards(s.cards)).toHaveLength(0);
  });

  it("appends transcript lines for both speakers in order", () => {
    const s = run([
      server(started),
      server({ type: "transcript", speaker: "customer", text: "Is it available?", at_ms: 1000 }),
      server({ type: "transcript", speaker: "agent", text: "It is.", at_ms: 2000 }),
    ]);
    expect(s.transcript.map((l) => [l.speaker, l.text])).toEqual([
      ["customer", "Is it available?"],
      ["agent", "It is."],
    ]);
    expect(new Set(s.transcript.map((l) => l.id)).size).toBe(2);
  });

  it("ignores transcript and cards before a call starts", () => {
    const s = run([
      server({ type: "transcript", speaker: "customer", text: "x", at_ms: 1 }),
      server(cardMsg()),
    ]);
    expect(s.transcript).toHaveLength(0);
    expect(selectCards(s.cards)).toHaveLength(0);
  });

  it("routes cards through the card reducer, measuring from turn_end", () => {
    const s = run([
      server(started, 0),
      server({ type: "turn_end", at_ms: 5 }, 1000),
      server(cardMsg(), 1700),
    ]);
    expect(selectCards(s.cards)[0]).toMatchObject({ text: "Hi", shownAfterMs: 700 });
  });

  it("drops cards of another call", () => {
    const s = run([server(started), server(cardMsg(OTHER))]);
    expect(selectCards(s.cards)).toHaveLength(0);
  });

  it("passes the turn_id of turn_end to the card reducer", () => {
    const T = "11111111-1111-4111-8111-111111111111";
    const s = run([server(started, 0), server({ type: "turn_end", at_ms: 5, turn_id: T }, 1000)]);
    expect(s.cards.turnEnds[T]).toBe(1000);
  });

  it("a hello during a live call means the connection dropped: the call ends with a system line", () => {
    const live = run([server(hello), server(started, 1000)]);
    const s = sessionReducer(live, server(hello, 5000));
    expect(s.phase).toBe("ended");
    expect(s.endedAt).toBe(5000);
    expect(s.transcript.at(-1)).toMatchObject({
      speaker: "system",
      system: "connection_lost",
      atMs: 4000,
    });
    expect(selectCards(sessionReducer(s, server(cardMsg())).cards)).toHaveLength(0);
  });

  it("a hello when no call is live just refreshes the greeting", () => {
    const s = run([server(hello), server({ ...hello, mode: "live" } as DemoServerMessage)]);
    expect(s.phase).toBe("idle");
    expect(s.hello?.mode).toBe("live");
    expect(s.transcript).toHaveLength(0);
  });

  it("ignores an escalation outside a live call", () => {
    const s = run([server(hello), server({ type: "escalation", question: "Q" })]);
    expect(s).toMatchObject({ escalations: [], notice: null, transcript: [] });
  });

  it("an escalation adds a system line, a record and a toast", () => {
    const s = run([
      server(started, 1000),
      server({ type: "escalation", question: "Bitcoin?" }, 4000),
    ]);
    expect(s.transcript.at(-1)).toMatchObject({
      speaker: "system",
      system: "escalation",
      text: "Bitcoin?",
      atMs: 3000,
    });
    expect(s.escalations).toEqual([{ question: "Bitcoin?", at: 4000 }]);
    expect(s.notice).toMatchObject({ kind: "escalation", text: "Bitcoin?" });
  });

  it("dismisses only the notice it names", () => {
    const s = run([server(started), server({ type: "escalation", question: "Q" })]);
    const id = s.notice?.id ?? -1;
    expect(sessionReducer(s, { type: "dismiss_notice", id: id + 99 })).toBe(s);
    expect(sessionReducer(s, { type: "dismiss_notice", id }).notice).toBeNull();
  });

  it("call_ended ends the current call but not for another call id", () => {
    const live = run([server(started)]);
    expect(sessionReducer(live, server({ type: "call_ended", call_id: OTHER })).phase).toBe("live");
    expect(sessionReducer(live, server({ type: "call_ended", call_id: CALL }, 9)).phase).toBe(
      "ended",
    );
  });

  it("cards that arrive after the call ended are ignored", () => {
    const s = run([
      server(started),
      server({ type: "call_ended", call_id: CALL }),
      server(cardMsg()),
    ]);
    expect(selectCards(s.cards)).toHaveLength(0);
  });

  it("an error from the bridge becomes a toast (the raw message stays out of the UI)", () => {
    const s = run([server({ type: "error", message: "Unknown scenario" })]);
    expect(s.notice).toMatchObject({ kind: "error" });
  });
});
