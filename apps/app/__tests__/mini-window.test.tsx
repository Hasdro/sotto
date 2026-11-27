/** UX-005: the floating mini window shows the whole suggestion (no two-line cut) and goes back
 * to idle as soon as a call ends, real or practice, instead of keeping the last card. */
import type { CardMessage, DemoServerMessage } from "@sotto/shared";
import { act, render, screen } from "@testing-library/react-native";
import MiniWindow from "../app/mini";
import { miniStateOf } from "../features/call/DesktopBridge";
import { initialSessionState, type SessionState, sessionReducer } from "../features/call/session";
import type { CallSession } from "../features/call/useCallSession";
import type { MiniState } from "../lib/desktop";

const CALL = "0b8f3c1e-7a2d-4e6f-8c9b-1d2e3f4a5b6c";
const LONG =
  "Rather than you having to go back and explain everything from scratch, let's have them join a short call with our solutions engineer this week so every question gets answered at once.";
const hello: DemoServerMessage = {
  type: "hello",
  v: 1,
  company_name: "Zylker",
  mode: "live",
  scenarios: [],
};

function card(over: Partial<CardMessage>): DemoServerMessage {
  return {
    type: "card",
    card: {
      v: 1,
      card_id: "6f1c2a52-3b7e-4d0a-9a51-0c3f8e2b7d11",
      call_id: CALL,
      seq: 0,
      type: "answer",
      source: "playbook",
      delta: LONG,
      done: true,
      ...over,
    },
  };
}

function sessionOf(msgs: DemoServerMessage[]): CallSession {
  const state = msgs.reduce<SessionState>(
    (s, msg, i) => sessionReducer(s, { type: "server", msg, now: 1000 + i * 100 }),
    initialSessionState,
  );
  return { state } as CallSession;
}

describe("miniStateOf (UX-005)", () => {
  it("live: the newest card without its WHY insight, the words heard and the source", () => {
    const s = sessionOf([
      hello,
      { type: "call_started", call_id: CALL },
      card({ delta: `${LONG}\nWHY: they asked twice about onboarding` }),
      { type: "partial", speaker: "customer", text: "and the price" } as DemoServerMessage,
    ]);
    const m = miniStateOf(s, "practice");
    expect(m.live).toBe(true);
    expect(m.card?.text).toBe(LONG);
    expect(m.partial).toBe("and the price");
    expect(m.source).toBe("practice");
  });

  it("ended: nothing stays in the mini window, even though the call screen keeps its cards", () => {
    const s = sessionOf([
      hello,
      { type: "call_started", call_id: CALL },
      card({}),
      { type: "call_ended", call_id: CALL },
    ]);
    expect(s.state.cards.order.length).toBeGreaterThan(0);
    expect(miniStateOf(s, "practice")).toEqual({
      live: false,
      card: null,
      partial: null,
      source: null,
    });
  });
});

describe("/mini (UX-005)", () => {
  let push: ((s: MiniState) => void) | null = null;
  beforeEach(() => {
    (globalThis as { sottoDesktop?: unknown }).sottoDesktop = {
      onMini: (cb: (s: MiniState) => void) => {
        push = cb;
        return () => {
          push = null;
        };
      },
      miniAction: jest.fn(),
    };
  });
  afterEach(() => {
    (globalThis as { sottoDesktop?: unknown }).sottoDesktop = undefined;
    push = null;
  });

  it("shows the whole suggestion, never cut at two lines", async () => {
    await render(<MiniWindow />);
    await act(async () =>
      push?.({
        live: true,
        card: { type: "answer", source: "playbook", label: null, text: LONG, done: true },
        partial: null,
        source: "computer",
      }),
    );
    const text = screen.getByText(LONG);
    expect(text.props.numberOfLines).toBeUndefined();
    expect(screen.getByTestId("mini-card-scroll")).toBeOnTheScreen();
  });

  it("goes back to idle when the call ends", async () => {
    await render(<MiniWindow />);
    await act(async () =>
      push?.({
        live: true,
        card: { type: "answer", source: "playbook", label: null, text: LONG, done: true },
        partial: null,
        source: "practice",
      }),
    );
    await act(async () => push?.({ live: false, card: null, partial: null, source: null }));
    expect(screen.queryByText(LONG)).toBeNull();
    expect(screen.getByText("No call right now")).toBeOnTheScreen();
    expect(screen.queryByText("Copy")).toBeNull();
  });
});
