import type { CardMessage, DemoServerMessage } from "@sotto/shared";
import { themes } from "@sotto/ui";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import * as RN from "react-native";
import { CallView } from "../app/call";
import { initialSessionState, type SessionState, sessionReducer } from "../features/call/session";
import type { CallSession } from "../features/call/useCallSession";
import { useIsWide } from "../lib/responsive";

jest.mock("../lib/responsive", () => ({ useIsWide: jest.fn(() => false) }));

const CALL = "0b8f3c1e-7a2d-4e6f-8c9b-1d2e3f4a5b6c";
const hello: DemoServerMessage = {
  type: "hello",
  v: 1,
  company_name: "Palm Grove Realty (demo)",
  mode: "fake",
  scenarios: [
    { id: "price-objection", title: "Price objection" },
    { id: "availability", title: "Availability" },
  ],
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
      delta: "Offer a viewing",
      done: false,
      ...over,
    },
  };
}

function stateFrom(msgs: DemoServerMessage[]): SessionState {
  return msgs.reduce<SessionState>(
    (s, msg, i) => sessionReducer(s, { type: "server", msg, now: 1000 + i * 100 }),
    initialSessionState,
  );
}

function session(state: SessionState): CallSession {
  return {
    state,
    start: jest.fn(() => true),
    say: jest.fn(() => true),
    end: jest.fn(() => true),
    retry: jest.fn(),
    dismissNotice: jest.fn(),
  };
}

describe("in-call screen", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.mocked(useIsWide).mockReturnValue(false);
  });

  it("shows the connecting state before hello", async () => {
    await render(<CallView session={session(initialSessionState)} mock={false} />);
    expect(screen.getByText("Connecting to the demo")).toBeOnTheScreen();
  });

  it("offline: tells the owner to run pnpm demo and retries on request", async () => {
    const s = session(
      sessionReducer(initialSessionState, { type: "connection", status: "offline" }),
    );
    await render(<CallView session={s} mock={false} />);
    expect(screen.getByText("pnpm demo")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(s.retry).toHaveBeenCalledTimes(1);
  });

  it("idle: picks a scenario and starts it", async () => {
    const s = session(stateFrom([hello]));
    await render(<CallView session={s} mock={false} />);
    await fireEvent.press(screen.getByRole("radio", { name: "Availability" }));
    await fireEvent.press(screen.getByRole("button", { name: "Start call" }));
    expect(s.start).toHaveBeenCalledWith("availability");
    await fireEvent.press(screen.getByRole("button", { name: "Start without a script" }));
    expect(s.start).toHaveBeenLastCalledWith(null);
  });

  it("shows the fake-AI mode badge and the dev-only mock badge", async () => {
    await render(
      <CallView
        session={session(stateFrom([hello, { type: "call_started", call_id: CALL }]))}
        mock
      />,
    );
    expect(screen.getByText("Fake AI")).toBeOnTheScreen();
    expect(screen.getByText("Mock stream (dev only)")).toBeOnTheScreen();
  });

  it("live with no card yet: a listening placeholder holds the hero slot", async () => {
    await render(
      <CallView
        session={session(stateFrom([hello, { type: "call_started", call_id: CALL }]))}
        mock={false}
      />,
    );
    expect(screen.getByTestId("listening")).toBeOnTheScreen();
  });

  it("renders the first delta as the hero card at once, streaming", async () => {
    const st = stateFrom([
      hello,
      { type: "call_started", call_id: CALL },
      { type: "turn_end", at_ms: 1 },
      card({}),
    ]);
    await render(<CallView session={session(st)} mock={false} />);
    expect(screen.getByTestId("hero-card")).toBeOnTheScreen();
    expect(screen.getByText(/Offer a viewing/)).toBeOnTheScreen();
    expect(screen.getByTestId("card-caret")).toBeOnTheScreen();
    expect(screen.getByText("On screen 0.10 s after the customer stopped")).toBeOnTheScreen();
  });

  it("an AI card carries the R2 notice", async () => {
    const st = stateFrom([
      hello,
      { type: "call_started", call_id: CALL },
      card({ source: "ai", done: true }),
    ]);
    await render(<CallView session={session(st)} mock={false} />);
    expect(screen.getByText("Not in playbook — check before promising")).toBeOnTheScreen();
  });

  it("the newest card is the hero; older cards are compact under 'Earlier'", async () => {
    const st = stateFrom([
      hello,
      { type: "call_started", call_id: CALL },
      card({ delta: "First", done: true }),
      card({ card_id: "6f1c2a52-3b7e-4d0a-9a51-0c3f8e2b7d12", delta: "Second", type: "objection" }),
    ]);
    await render(<CallView session={session(st)} mock={false} />);
    expect(screen.getByTestId("hero-card")).toHaveStyle({
      backgroundColor: themes.light.card.objection.fill,
    });
    expect(screen.getByText("Earlier in this call")).toBeOnTheScreen();
    expect(screen.getByText("First")).toHaveProp("numberOfLines", 2);
  });

  it("types a customer line and sends it", async () => {
    const s = session(stateFrom([hello, { type: "call_started", call_id: CALL }]));
    await render(<CallView session={s} mock={false} />);
    await fireEvent.changeText(screen.getByTestId("composer-input"), "  Is it available?  ");
    await fireEvent.press(screen.getByTestId("composer-send"));
    expect(s.say).toHaveBeenCalledWith("customer", "Is it available?");
  });

  it("switches the speaker to the agent", async () => {
    const s = session(stateFrom([hello, { type: "call_started", call_id: CALL }]));
    await render(<CallView session={s} mock={false} />);
    await fireEvent.press(screen.getByTestId("speaker-toggle"));
    await fireEvent.changeText(screen.getByTestId("composer-input"), "It is.");
    await fireEvent.press(screen.getByTestId("composer-send"));
    expect(s.say).toHaveBeenCalledWith("agent", "It is.");
  });

  it("does not send an empty line", async () => {
    const s = session(stateFrom([hello, { type: "call_started", call_id: CALL }]));
    await render(<CallView session={s} mock={false} />);
    await fireEvent.changeText(screen.getByTestId("composer-input"), "   ");
    await fireEvent.press(screen.getByTestId("composer-send"));
    expect(s.say).not.toHaveBeenCalled();
  });

  it("ends the call", async () => {
    const s = session(stateFrom([hello, { type: "call_started", call_id: CALL }]));
    await render(<CallView session={s} mock={false} />);
    await fireEvent.press(screen.getByRole("button", { name: "End call" }));
    expect(s.end).toHaveBeenCalledTimes(1);
  });

  it("an escalation shows 'Sent to your manager' and is dismissed after a while", async () => {
    jest.useFakeTimers();
    const st = stateFrom([
      hello,
      { type: "call_started", call_id: CALL },
      { type: "escalation", question: "Bitcoin deposit?" },
    ]);
    const s = session(st);
    await render(<CallView session={s} mock={false} />);
    expect(screen.getByTestId("toast")).toBeOnTheScreen();
    expect(screen.getAllByText("Sent to your manager").length).toBeGreaterThan(0);
    await act(async () => {
      jest.advanceTimersByTime(8000);
    });
    expect(s.dismissNotice).toHaveBeenCalledWith(st.notice?.id);
    jest.useRealTimers();
  });

  it("ended: offers another call and hides the composer", async () => {
    const s = session(
      stateFrom([
        hello,
        { type: "call_started", call_id: CALL },
        { type: "call_ended", call_id: CALL },
      ]),
    );
    await render(<CallView session={s} mock={false} />);
    expect(screen.getByText("Call ended")).toBeOnTheScreen();
    expect(screen.queryByTestId("composer-input")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Start another call" }));
    expect(s.start).toHaveBeenCalledWith(null);
  });

  it("uses the wide two-column layout at laptop width", async () => {
    jest.mocked(useIsWide).mockReturnValue(true);
    const s = session(stateFrom([hello, { type: "call_started", call_id: CALL }]));
    await render(<CallView session={s} mock={false} />);
    expect(screen.getByTestId("speaker")).toBeOnTheScreen();
    expect(screen.queryByTestId("speaker-toggle")).toBeNull();
  });

  it.each(["light", "dark"] as const)("follows the %s colour scheme", async (scheme) => {
    jest.spyOn(RN, "useColorScheme").mockReturnValue(scheme);
    const st = stateFrom([hello, { type: "call_started", call_id: CALL }, card({ done: true })]);
    await render(<CallView session={session(st)} mock={false} />);
    expect(screen.getByTestId("hero-card")).toHaveStyle({
      backgroundColor: themes[scheme].card.answer.fill,
    });
  });
});
