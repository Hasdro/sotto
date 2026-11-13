import { screen } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import RootLayout from "../app/_layout";
import CallDetailScreen from "../app/history/[id]";
import HistoryScreen from "../app/history/index";
import { toPastCall } from "../features/history/server";
import { saveDeviceCall, setAfterCallItem } from "../lib/deviceHistory";

const CALL = {
  id: "0b8f3c1e-7a2d-4e6f-8c9b-1d2e3f4a5b6c",
  started_at: Date.parse("2026-10-21T03:00:00Z"),
  ended_at: Date.parse("2026-10-21T03:02:10Z"),
  title: "Spoken call",
  mode: "live" as const,
  cards: 1,
  p50_ms: 520,
  p95_ms: 520,
};
const DETAIL = {
  ...CALL,
  transcript: [
    { kind: "line", speaker: "customer", text: "Is parking included?", at_ms: 4200 },
    { kind: "card", type: "answer", source: "playbook", text: "One covered space.", at_ms: 4700 },
    { kind: "escalation", text: "Is parking included?", at_ms: 5000 },
  ],
};

function serve(detail: unknown = DETAIL) {
  globalThis.fetch = jest.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => (url.endsWith("/api/calls") ? { calls: [CALL] } : detail),
  })) as unknown as typeof fetch;
}

const routes = {
  _layout: RootLayout,
  "history/index": HistoryScreen,
  "history/[id]": CallDetailScreen,
};

describe("history from this server (D-020)", () => {
  it("maps a server call to a past call with its outcome, lines and cards", () => {
    const call = toPastCall(DETAIL as Parameters<typeof toPastCall>[0]);
    expect(call.outcome).toBe("live");
    expect(call.minutes).toBe(2);
    expect(call.transcript).toEqual([
      { speaker: "customer", text: "Is parking included?", atMs: 4200 },
    ]);
    expect(call.cards).toEqual([
      { type: "answer", source: "playbook", text: "One covered space.", atMs: 4700 },
    ]);
  });

  it("lists the real calls without mixing in samples", async () => {
    serve();
    await renderRouter(routes, { initialUrl: "/history" });
    expect(await screen.findByText("Your calls")).toBeOnTheScreen();
    expect(screen.getByText("Spoken call")).toBeOnTheScreen();
    expect(screen.queryByText("Sample calls")).toBeNull();
    expect(screen.queryByText("Layla Haddad")).toBeNull();
  });

  it("shows a server call's transcript and cards", async () => {
    serve();
    await renderRouter(routes, { initialUrl: `/history/${CALL.id}` });
    expect(await screen.findByText("Is parking included?")).toBeOnTheScreen();
    expect(screen.getByText("One covered space.")).toBeOnTheScreen();
  });

  it("rates AI cards in History but never playbook or holding ones (UX-02h, R11)", async () => {
    serve({
      ...DETAIL,
      transcript: [
        ...DETAIL.transcript,
        {
          kind: "card",
          type: "answer",
          source: "ai",
          text: "We ship in 3 days.",
          at_ms: 6000,
          id: "k7",
        },
        { kind: "card", type: "holding", source: "holding", text: "Let me confirm.", at_ms: 7000 },
      ],
    });
    await renderRouter(routes, { initialUrl: `/history/${CALL.id}` });
    expect(await screen.findByText("We ship in 3 days.")).toBeOnTheScreen();
    expect(screen.getByTestId("rating-k7")).toBeOnTheScreen(); // the live card's id
    expect(screen.queryByTestId("rating-h-4700-answer")).toBeNull(); // playbook
    expect(screen.queryByTestId("rating-h-7000-holding")).toBeNull();
  });

  it("lists the after-call items that were saved and skipped (UX-23)", async () => {
    serve();
    saveDeviceCall({
      id: CALL.id,
      started_at: CALL.started_at,
      ended_at: CALL.ended_at,
      title: CALL.title,
      mode: "live",
      cards: 1,
      p50_ms: null,
      p95_ms: null,
      transcript: [],
    });
    setAfterCallItem(CALL.id, { id: "call_log", label: "Call log" }, "saved");
    setAfterCallItem(CALL.id, { id: "meeting", label: "Meeting: 2026-11-20 15:30" }, "skipped");
    await renderRouter(routes, { initialUrl: `/history/${CALL.id}` });
    expect(await screen.findByTestId("call-detail-after")).toBeOnTheScreen();
    expect(screen.getByTestId("call-detail-saved")).toHaveTextContent(/Call log/);
    expect(screen.getByTestId("call-detail-skipped")).toHaveTextContent(
      /Meeting: 2026-11-20 15:30/,
    );
  });
});
