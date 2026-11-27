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

  it("names an unnamed call and labels the cards and the chance to close (UX-009, UI-008)", async () => {
    const old = {
      ...CALL,
      id: "c-old",
      title: "Call 11/14/2026, 9:46:45 AM",
      started_at: Date.parse("2026-11-14T05:46:45Z"),
      ended_at: Date.parse("2026-11-14T05:48:00Z"),
      cards: 8,
      review: { success: 20 },
    };
    const one = { ...CALL, id: "c-one", title: "Desmond Lee", company: "Acme Trading", cards: 1 };
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ calls: [old, one] }),
    })) as unknown as typeof fetch;
    await renderRouter(routes, { initialUrl: "/history" });
    const row = await screen.findByTestId("history-row-c-old");
    expect(row).toHaveTextContent(/Morning call/);
    expect(row).not.toHaveTextContent(/Call 11\/14\/2026/);
    expect(row).toHaveTextContent(/14 Nov 2026.*09:46/);
    expect(row).toHaveTextContent(/8 cards/);
    expect(screen.getByTestId("history-chance-c-old")).toHaveTextContent("20% to close");
    const named = screen.getByTestId("history-row-c-one");
    expect(named).toHaveTextContent(/Desmond Lee/);
    expect(named).toHaveTextContent(/Acme Trading/);
    expect(named).toHaveTextContent(/1 card(?!s)/);
    expect(screen.queryByTestId("history-chance-c-one")).toBeNull(); // no review, no meter
  });

  it("titles the call detail the same way (UX-009)", async () => {
    serve({ ...DETAIL, title: "Call 10/21/2026, 7:00:00 AM" }); // 07:00 Dubai
    await renderRouter(routes, { initialUrl: `/history/${CALL.id}` });
    expect(await screen.findByText("Morning call")).toBeOnTheScreen();
    expect(screen.queryByText(/Call 10\/21\/2026/)).toBeNull();
  });

  it("shows each card whole, named, with labelled ratings (UX-010)", async () => {
    const long =
      "Thanks for sharing. When would be a convenient time for us to schedule the follow-up with your finance lead so we can agree the setup scope?";
    serve({
      ...DETAIL,
      transcript: [
        ...DETAIL.transcript,
        { kind: "card", type: "question", source: "ai", text: long, at_ms: 6000, id: "k9" },
      ],
    });
    await renderRouter(routes, { initialUrl: `/history/${CALL.id}` });
    const text = await screen.findByText(long);
    expect(text.props.numberOfLines).toBeUndefined(); // the whole sentence, never "…"
    expect(screen.getByTestId("history-card-k9-kind")).toHaveTextContent(
      "Ask next · Not in playbook — check before promising",
    );
    expect(screen.getByTestId("history-card-h-4700-answer-kind")).toHaveTextContent(
      "Answer · From your playbook",
    );
    expect(screen.getByTestId("rate-up-k9")).toHaveTextContent("Helpful");
    expect(screen.getByTestId("rate-down-k9")).toHaveTextContent("Not helpful");
    expect(screen.queryByTestId("history-no-cards")).toBeNull();
  });

  it("says so when no card was shown (UX-010)", async () => {
    serve({ ...DETAIL, transcript: [DETAIL.transcript[0]] });
    await renderRouter(routes, { initialUrl: `/history/${CALL.id}` });
    expect(await screen.findByTestId("history-no-cards")).toHaveTextContent(
      "No cards were shown on this call.",
    );
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
