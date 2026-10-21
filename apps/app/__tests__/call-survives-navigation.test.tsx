/** Opening another page mid-call keeps the call; only End (confirmed) ends it (T-025). */
import { UIProvider } from "@sotto/ui";
import { act, fireEvent, screen } from "@testing-library/react-native";
import { router, Slot } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { Text } from "react-native";
import CallScreen from "../app/call";
import type { SocketFactory } from "../features/call/bridge";
import { CallSessionProvider } from "../features/call/CallSessionProvider";
import { LocaleProvider } from "../lib/locale";

jest.mock("../features/call/devGate", () => ({ demoEnabled: () => true }));
jest.mock("../lib/responsive", () => ({ useIsWide: () => false }));

const CALL_ID = "0b8f3c1e-7a2d-4e6f-8c9b-1d2e3f4a5b6c";

type Sock = ReturnType<SocketFactory> & { onmessage: ((ev: { data: unknown }) => void) | null };

function fakeServer() {
  const sent: { type: string }[] = [];
  let sockets = 0;
  let closed = 0;
  const factory: SocketFactory = () => {
    sockets += 1;
    const sock: Sock = {
      readyState: 1,
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null,
      send: (raw: string | ArrayBuffer) => {
        if (typeof raw !== "string") return;
        const msg = JSON.parse(raw) as { type: string };
        sent.push(msg);
        const reply = (data: object) =>
          setTimeout(() => sock.onmessage?.({ data: JSON.stringify(data) }));
        if (msg.type === "start") reply({ type: "call_started", call_id: CALL_ID });
        if (msg.type === "end") reply({ type: "call_ended", call_id: CALL_ID });
      },
      close: () => {
        closed += 1;
      },
    };
    setTimeout(() =>
      sock.onmessage?.({
        data: JSON.stringify({
          type: "hello",
          v: 1,
          company_name: "Acme",
          mode: "live",
          scenarios: [{ id: "s1", title: "Practice" }],
        }),
      }),
    );
    return sock;
  };
  return { factory, sent, stats: () => ({ sockets, closed }) };
}

const tick = () =>
  act(async () => {
    jest.advanceTimersByTime(10);
  });

describe("a live call survives navigation", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("keeps the call when the agent opens another page, and ends it once on confirm", async () => {
    const server = fakeServer();
    const Layout = () => (
      <LocaleProvider>
        <UIProvider direction="ltr">
          <CallSessionProvider socketFactory={server.factory}>
            <Slot />
          </CallSessionProvider>
        </UIProvider>
      </LocaleProvider>
    );
    await renderRouter(
      { _layout: Layout, call: CallScreen, history: () => <Text>History page</Text> },
      { initialUrl: "/call" },
    );
    await tick();
    await fireEvent.press(await screen.findByTestId("start-call"));
    await tick();
    expect(await screen.findByTestId("status-live")).toBeOnTheScreen();

    await act(async () => router.push("/history"));
    expect(await screen.findByText("History page")).toBeOnTheScreen();
    await act(async () => router.push("/call"));
    expect(await screen.findByTestId("status-live")).toBeOnTheScreen();
    expect(server.stats()).toEqual({ sockets: 1, closed: 0 });
    expect(server.sent.filter((m) => m.type === "end")).toHaveLength(0);

    await fireEvent.press(screen.getByTestId("end-call"));
    expect(server.sent.filter((m) => m.type === "end")).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("confirm-end-yes"));
    await tick();
    expect(server.sent.filter((m) => m.type === "end")).toHaveLength(1);
    expect(await screen.findByTestId("call-ended")).toBeOnTheScreen();
  });
});
