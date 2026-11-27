/** PROD-002: during a call the newest card can be copied in one click and, in the desktop app,
 * the mini window opens from the call header; both show their keyboard shortcut. The "Why?"
 * insight is a clear toggle in the same row (UI-005). */
import type { CardMessage, DemoServerMessage } from "@sotto/shared";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import * as RN from "react-native";
import { CallView } from "../app/call";
import { initialSessionState, type SessionState, sessionReducer } from "../features/call/session";
import type { CallSession } from "../features/call/useCallSession";

jest.mock("../lib/responsive", () => ({ useIsWide: jest.fn(() => true) }));
jest.mock("../features/call/devGate", () => ({ demoEnabled: jest.fn(() => true) }));
jest.mock("../components/FeatureGate", () => ({
  ...jest.requireActual("../components/FeatureGate"),
  useFeature: () => ({ state: "available" }),
}));

const CALL = "0b8f3c1e-7a2d-4e6f-8c9b-1d2e3f4a5b6c";
const MAIN = "Ask what they compare it with";
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
      delta: `${MAIN}\nWHY: they named a competitor twice`,
      done: true,
      ...over,
    },
  };
}

function session(msgs: DemoServerMessage[]): CallSession {
  const state = msgs.reduce<SessionState>(
    (s, msg, i) => sessionReducer(s, { type: "server", msg, now: 1000 + i * 100 }),
    initialSessionState,
  );
  return {
    state,
    start: jest.fn(() => true),
    say: jest.fn(() => true),
    end: jest.fn(() => true),
    retry: jest.fn(),
    dismissNotice: jest.fn(),
    mic: "on",
    source: "computer",
    toggleMic: jest.fn(),
    startListening: jest.fn(),
  };
}

const live = () => session([hello, { type: "call_started", call_id: CALL }, card({})]);
/** The desktop app's preload bridge, with only what the call screen reads. */
const fakeDesktop = (extra: Record<string, unknown>) => {
  (globalThis as { sottoDesktop?: unknown }).sottoDesktop = {
    callState: () => Promise.resolve({ app: null }),
    onCallState: () => () => {},
    ...extra,
  };
};
const setUA = (ua: string) =>
  Object.defineProperty(globalThis.navigator, "userAgent", { value: ua, configurable: true });

describe("live call actions (PROD-002)", () => {
  const writeText = jest.fn(() => Promise.resolve());
  beforeEach(() => {
    jest.replaceProperty(RN.Platform, "OS", "web");
    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    setUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Electron/39");
    writeText.mockClear();
  });
  afterEach(() => {
    (globalThis as { sottoDesktop?: unknown }).sottoDesktop = undefined;
    jest.restoreAllMocks();
  });

  it("Copy puts the card's sentence (without the WHY insight) on the clipboard", async () => {
    await render(<CallView session={live()} mock={false} />);
    await act(async () => fireEvent.press(screen.getByTestId("hero-copy")));
    expect(writeText).toHaveBeenCalledWith(MAIN);
    expect(screen.getByText("Copied")).toBeOnTheScreen();
  });

  it("the browser shows Copy but no desktop shortcut or mini window", async () => {
    await render(<CallView session={live()} mock={false} />);
    expect(screen.getByTestId("hero-copy")).toBeOnTheScreen();
    expect(screen.queryByTestId("hero-copy-shortcut")).toBeNull();
    expect(screen.queryByTestId("mini-window-open")).toBeNull();
  });

  it("the desktop app: the mini window opens from the header, and both show their shortcut", async () => {
    const showMini = jest.fn();
    fakeDesktop({ showMini });
    await render(<CallView session={live()} mock={false} />);
    expect(screen.getByTestId("hero-copy-shortcut")).toHaveTextContent(/⌃⌥C/);
    const mini = screen.getByTestId("mini-window-open");
    expect(mini.props.accessibilityHint).toMatch(/⌃⌥M/);
    await fireEvent.press(mini);
    expect(showMini).toHaveBeenCalledWith(true);
    // End call stays the last control in the header (UX-15).
    const bar = mini.parent as { children: { props?: { testID?: string } }[] };
    expect(bar.children.map((c) => c.props?.testID).at(-1)).toBe("end-call");
  });

  it("Windows names its own shortcut keys", async () => {
    setUA("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Electron/39");
    fakeDesktop({ showMini: jest.fn() });
    await render(<CallView session={live()} mock={false} />);
    expect(screen.getByTestId("hero-copy-shortcut")).toHaveTextContent(/Ctrl\+Shift\+Alt\+C/);
  });

  it("Why? is a labelled toggle with its insight hidden until pressed (UI-005)", async () => {
    await render(<CallView session={live()} mock={false} />);
    const why = screen.getByRole("button", { name: "Why?" });
    expect(why.props.accessibilityState).toMatchObject({ expanded: false });
    expect(screen.queryByText("they named a competitor twice")).toBeNull();
    await fireEvent.press(why);
    expect(screen.getByText("they named a competitor twice")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Hide insight" })).toBeOnTheScreen();
  });

  it("speaks Arabic", async () => {
    const { LocaleProvider } = jest.requireActual(
      "../lib/locale",
    ) as typeof import("../lib/locale");
    fakeDesktop({ showMini: jest.fn() });
    await render(
      <LocaleProvider initial="ar">
        <CallView session={live()} mock={false} />
      </LocaleProvider>,
    );
    expect(screen.getByText("نسخ")).toBeOnTheScreen();
    expect(screen.getByText("النافذة الصغيرة")).toBeOnTheScreen();
  });
});
