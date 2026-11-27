/** Practice call in a real account (D-073): `/call?practice=1` and the start screen's link open
 * the practice start; the call is labelled "Practice", has nothing to type or rate, and the
 * after-call view says nothing was kept. What it writes is covered in practice.test.ts. */
import type { DemoServerMessage } from "@sotto/shared";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import * as RN from "react-native";
import practiceSeed from "../../../seed/practice/practice.json";
import { CallView } from "../app/call";
import { setPracticeRun } from "../features/call/practice";
import { initialSessionState, type SessionState, sessionReducer } from "../features/call/session";
import type { CallSession } from "../features/call/useCallSession";

jest.mock("../lib/responsive", () => ({ useIsWide: jest.fn(() => false) }));
jest.mock("../features/call/devGate", () => ({ demoEnabled: jest.fn(() => true) }));
let mockBundle: Record<string, unknown> | null = { practice: practiceSeed, scenarios: [] };
jest.mock("../lib/useCloud", () => {
  const actual = jest.requireActual("../lib/useCloud");
  return {
    ...actual,
    useCloud: () => {
      const real = actual.useCloud();
      return mockBundle ? { ...real, status: "signed_in", bundle: mockBundle } : real;
    },
  };
});

const CALL = "0b8f3c1e-7a2d-4e6f-8c9b-1d2e3f4a5b6c";
const hello: DemoServerMessage = {
  type: "hello",
  v: 1,
  company_name: "Zylker",
  mode: "live",
  scenarios: [],
};

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
    mic: "off",
    source: "mic",
    toggleMic: jest.fn(),
    startListening: jest.fn(),
  };
}

const card: DemoServerMessage = {
  type: "card",
  card: {
    v: 1,
    card_id: "6f1c2a52-3b7e-4d0a-9a51-0c3f8e2b7d11",
    call_id: CALL,
    seq: 0,
    type: "answer",
    source: "ai",
    delta: "Ask what they compare it with",
    done: true,
  },
};

describe("practice call (D-073)", () => {
  beforeEach(async () => {
    mockBundle = { practice: practiceSeed, scenarios: [] };
    jest.replaceProperty(RN.Platform, "OS", "web");
    await act(async () => setPracticeRun(false));
  });
  afterEach(() => jest.restoreAllMocks());

  it("/call?practice=1 opens the practice start, which plays the neutral script", async () => {
    const s = session(stateFrom([hello]));
    await render(<CallView session={s} mock={false} practice />);
    expect(screen.getByTestId("practice-start")).toBeOnTheScreen();
    expect(screen.getByText(/Nothing is saved, rated or sent/)).toBeOnTheScreen();
    expect(screen.queryByTestId("listen-start")).toBeNull();
    await fireEvent.press(screen.getByTestId("practice-go"));
    expect(s.start).toHaveBeenCalledWith("practice:practice");
    expect(s.startListening).not.toHaveBeenCalled();
  });

  it("the start screen links to practice, and back again", async () => {
    await render(<CallView session={session(stateFrom([hello]))} mock={false} />);
    await fireEvent.press(screen.getByTestId("practice-open"));
    expect(screen.getByTestId("practice-start")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("practice-real"));
    expect(screen.getByTestId("listen-start")).toBeOnTheScreen();
  });

  it("phones can practise too", async () => {
    jest.replaceProperty(RN.Platform, "OS", "ios");
    await render(<CallView session={session(stateFrom([hello]))} mock={false} />);
    await fireEvent.press(screen.getByTestId("practice-open"));
    expect(screen.getByTestId("practice-start")).toBeOnTheScreen();
  });

  it("an older server without the script offers no practice", async () => {
    mockBundle = { scenarios: [] };
    await render(<CallView session={session(stateFrom([hello]))} mock={false} practice />);
    expect(screen.queryByTestId("practice-go")).toBeNull();
    expect(screen.getByText(/next server update/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("practice-real"));
    expect(screen.queryByTestId("practice-open")).toBeNull();
  });

  it("during practice: 'Practice' in the header, nothing to type, no listen bar, no rating", async () => {
    await act(async () => setPracticeRun(true));
    const s = session(stateFrom([hello, { type: "call_started", call_id: CALL }, card]));
    await render(<CallView session={s} mock={false} />);
    // UI-005: "Practice call" is the title, said once (no second "Practice" by the clock).
    expect(screen.getByTestId("call-title")).toHaveTextContent("Practice call");
    expect(screen.queryAllByText("Practice")).toHaveLength(0);
    expect(screen.queryByTestId("composer-input")).toBeNull();
    expect(screen.queryByTestId("mic-toggle")).toBeNull();
    expect(screen.getByTestId("hero-card")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Rate this suggestion")).toBeNull();
  });

  it("after practice: nothing kept, no History link, and 'again' replays the practice", async () => {
    await act(async () => setPracticeRun(true));
    const s = session(
      stateFrom([
        hello,
        { type: "call_started", call_id: CALL },
        card,
        { type: "call_ended" } as never,
      ]),
    );
    if (s.state.phase !== "ended") s.state = { ...s.state, phase: "ended" };
    await render(<CallView session={s} mock={false} />);
    expect(screen.getByTestId("practice-ended")).toBeOnTheScreen();
    expect(screen.queryByTestId("after-history")).toBeNull();
    expect(screen.queryByLabelText("Rate this suggestion")).toBeNull();
    await fireEvent.press(screen.getByTestId("call-again"));
    expect(s.start).toHaveBeenCalledWith("practice:practice");
  });

  it("a real call after practice is a normal call", async () => {
    await act(async () => setPracticeRun(false));
    const s = session(stateFrom([hello, { type: "call_started", call_id: CALL }]));
    await render(<CallView session={s} mock={false} />);
    expect(screen.getByTestId("call-title")).toHaveTextContent(/^Call$/);
  });
  it("End practice ends at once: no dialog about saving to History (UX-007)", async () => {
    await act(async () => setPracticeRun(true));
    const s = session(stateFrom([hello, { type: "call_started", call_id: CALL }, card]));
    await render(<CallView session={s} mock={false} />);
    const end = screen.getByTestId("end-call");
    expect(end).toHaveTextContent("End practice");
    await fireEvent.press(end);
    expect(s.end).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("confirm-end")).toBeNull();
    expect(screen.queryByText(/saves the call to your history/)).toBeNull();
  });

  it("the ended practice shows how long it really ran (UX-007)", async () => {
    await act(async () => setPracticeRun(true));
    let st = stateFrom([hello, { type: "call_started", call_id: CALL }]); // started at 1100
    st = sessionReducer(st, { type: "end_requested", now: 23_100 });
    st = sessionReducer(st, {
      type: "server",
      msg: { type: "call_ended", call_id: CALL },
      now: 183_100,
    });
    await render(<CallView session={session(st)} mock={false} />);
    expect(screen.getByText("00:22")).toBeOnTheScreen();
  });
});
