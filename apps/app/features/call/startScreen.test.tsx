/** UX-20 one start screen, UX-21 desktop permission help, ZC-08 audio check screen. */
import { themes, UIProvider } from "@sotto/ui";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { LocaleProvider } from "../../lib/locale";
import { prefs } from "../../lib/prefs";
import type { CheckResult } from "./audioSetup";
import { AudioCheck } from "./components/AudioCheck";
import { ListenBar, permissionHelp } from "./components/ListenBar";
import { ListenStart, startPlan } from "./components/ListenStart";

const g = globalThis as { sottoDesktop?: unknown; navigator?: unknown };
const savedNavigator = g.navigator;
afterEach(() => {
  delete g.sottoDesktop;
  Object.defineProperty(globalThis, "navigator", { value: savedNavigator, configurable: true });
});

function ua(userAgent: string) {
  Object.defineProperty(globalThis, "navigator", { value: { userAgent }, configurable: true });
}
function fakeDesktop() {
  const openPrivacySettings = jest.fn(async () => ({ ok: true as const }));
  g.sottoDesktop = {
    callState: async () => ({ app: null }),
    onCallState: () => () => {},
    openPrivacySettings,
  };
  return openPrivacySettings;
}
const wrap = (node: React.ReactNode, locale: "en" | "ar" = "en") =>
  render(
    <LocaleProvider initial={locale}>
      <UIProvider direction={locale === "ar" ? "rtl" : "ltr"}>{node}</UIProvider>
    </LocaleProvider>,
  );

describe("start screen (UX-20)", () => {
  it("plans the start from what the app hears and sees", () => {
    expect(startPlan(true, "us.zoom.xos")).toEqual({
      primary: "computer",
      secondary: "mic",
      detected: true,
    });
    expect(startPlan(true, null)).toEqual({
      primary: "mic",
      secondary: "computer",
      detected: false,
    });
    expect(startPlan(false, null)).toEqual({ primary: "mic", secondary: null, detected: false });
  });

  it("a detected call app: one primary 'Start listening' on the computer's sound", async () => {
    const onStart = jest.fn();
    await wrap(<ListenStart computer callApp="us.zoom.xos" onStart={onStart} />);
    expect(screen.getByTestId("start-title")).toHaveTextContent("Zoom call detected");
    expect(screen.getAllByRole("button", { name: "Start listening" })).toHaveLength(1);
    await fireEvent.press(screen.getByTestId("start-call"));
    expect(onStart).toHaveBeenLastCalledWith("computer");
    await fireEvent.press(screen.getByTestId("source-mic"));
    expect(onStart).toHaveBeenLastCalledWith("mic");
  });

  it("no call app: the microphone is primary; every start says 'Start listening'", async () => {
    const onStart = jest.fn();
    await wrap(<ListenStart computer callApp={null} onStart={onStart} />);
    await fireEvent.press(screen.getByTestId("start-call"));
    expect(onStart).toHaveBeenLastCalledWith("mic");
    expect(screen.getByTestId("source-computer")).toHaveTextContent(/^Start listening/);
    expect(screen.queryByText("Start now")).toBeNull();
    // Practice stays off this screen for real accounts until owner Q15 (D-024, T-038).
    expect(screen.queryByText(/Practice/)).toBeNull();
  });

  it("one primary start; the other source, Test audio and practice are outline buttons (UI-006)", async () => {
    await wrap(
      <ListenStart
        computer
        callApp={null}
        onStart={() => {}}
        onCheck={() => {}}
        onPractice={() => {}}
      />,
    );
    for (const id of ["source-computer", "check-audio-open", "practice-open"]) {
      expect(screen.getByTestId(id)).toHaveStyle({ borderColor: themes.light.color.borderStrong });
    }
    expect(screen.getByTestId("start-call")).toHaveStyle({
      backgroundColor: themes.light.color.primary,
    });
    // The tools sit in their own row under the starts.
    expect(screen.getByTestId("start-tools")).toContainElement(
      screen.getByTestId("check-audio-open"),
    );
    expect(screen.getByTestId("start-tools")).not.toContainElement(
      screen.getByTestId("start-call"),
    );
  });

  it("speaks Arabic", async () => {
    await wrap(<ListenStart computer callApp="us.zoom.xos" onStart={() => {}} />, "ar");
    expect(screen.getByText("ابدأ الاستماع")).toBeOnTheScreen();
  });
});

describe("desktop permission help (UX-21)", () => {
  it("names the exact pane per OS and source", () => {
    expect(permissionHelp("denied", "computer", true, "mac")?.pane).toBe("system-audio");
    expect(permissionHelp("denied", "mic", true, "mac")?.pane).toBe("mic");
    expect(permissionHelp("denied", "mic", true, "windows")?.pane).toBe("mic");
    expect(permissionHelp("denied", "mic", false, "mac")?.pane).toBeNull(); // browser
    expect(permissionHelp("on", "mic", true, "mac")).toBeNull();
    // The desktop app never says "It needs HTTPS".
    expect(permissionHelp("unsupported", "mic", true, "mac")?.text).toEqual({
      call: "perm.noMicDesktop",
    });
  });

  it("Mac, system audio blocked: the copy and a button to Screen & System Audio Recording", async () => {
    ua("Mozilla/5.0 (Macintosh) Electron/44");
    const open = fakeDesktop();
    await wrap(
      <ListenBar
        state="denied"
        source="computer"
        vendor={null}
        partial={null}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByText(/Allow Sales Shield to record system audio/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("open-privacy"));
    expect(open).toHaveBeenCalledWith("system-audio");
  });

  it("Windows, microphone blocked: opens the microphone privacy page", async () => {
    ua("Mozilla/5.0 (Windows NT 10.0) Electron/44");
    const open = fakeDesktop();
    await wrap(
      <ListenBar state="denied" source="mic" vendor={null} partial={null} onToggle={() => {}} />,
    );
    expect(screen.getByText("Open Windows Settings")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("open-privacy"));
    expect(open).toHaveBeenCalledWith("mic");
  });

  it("in a browser: no settings button", async () => {
    ua("Mozilla/5.0 (Macintosh) Chrome/140");
    await wrap(
      <ListenBar state="denied" source="mic" vendor={null} partial={null} onToggle={() => {}} />,
    );
    expect(screen.queryByTestId("open-privacy")).toBeNull();
  });
});

describe("audio check screen (ZC-08)", () => {
  it("runs the check, shows the fix and the pane button, and remembers the result", async () => {
    ua("Mozilla/5.0 (Macintosh) Electron/44");
    const open = fakeDesktop();
    let finish: (r: CheckResult) => void = () => {};
    const run = jest.fn(
      ({ onLevel }: { onLevel?: (l: { customer: number; agent: number }) => void }) =>
        new Promise<CheckResult>((resolve) => {
          onLevel?.({ customer: 0, agent: 0.1 });
          finish = resolve;
        }),
    );
    const view = await wrap(<AudioCheck computer run={run as never} />);
    await fireEvent.press(screen.getByTestId("check-run"));
    expect(screen.getByTestId("check-level-agent")).toBeOnTheScreen();
    expect(screen.getByTestId("check-level-customer")).toBeOnTheScreen();
    await act(async () => finish({ customer: "denied", agent: "ok", at: 1 }));
    expect(screen.getByTestId("check-result")).toHaveTextContent(
      /cannot hear this computer's sound/,
    );
    await fireEvent.press(screen.getByTestId("check-open-privacy"));
    expect(open).toHaveBeenCalledWith("system-audio");
    await view.unmount();

    // Next time on the same device, the last result is shown before any new check.
    await wrap(<AudioCheck computer run={run as never} />);
    await waitFor(() => expect(screen.getByTestId("check-result")).toBeOnTheScreen());
  });

  it("a passing check marks Home's Test audio step done; a failing one does not", async () => {
    ua("Mozilla/5.0 (Macintosh) Electron/44");
    const bad = jest.fn(async () => ({ customer: "silent", agent: "ok", at: 1 }) as CheckResult);
    const first = await wrap(<AudioCheck computer run={bad as never} />);
    await fireEvent.press(screen.getByTestId("check-run"));
    await waitFor(() => expect(screen.getByTestId("check-result")).toBeOnTheScreen());
    expect(prefs().audioChecked).toBeFalsy();
    await first.unmount();
    const good = jest.fn(async () => ({ customer: "ok", agent: "ok", at: 2 }) as CheckResult);
    await wrap(<AudioCheck computer run={good as never} />);
    await fireEvent.press(screen.getByTestId("check-run"));
    await waitFor(() => expect(prefs().audioChecked).toBe(true));
  });
});
