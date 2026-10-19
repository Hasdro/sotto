import { screen } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import RootLayout from "../app/_layout";
import CallDetailScreen from "../app/history/[id]";
import HistoryScreen from "../app/history/index";
import { toPastCall } from "../features/history/server";

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

function serve() {
  globalThis.fetch = jest.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => (url.endsWith("/api/calls") ? { calls: [CALL] } : DETAIL),
  })) as unknown as typeof fetch;
}

const routes = {
  _layout: RootLayout,
  "history/index": HistoryScreen,
  "history/[id]": CallDetailScreen,
};

describe("history from this server (D-020)", () => {
  it("maps a server call to a practice call with its lines and cards", () => {
    const call = toPastCall(DETAIL as Parameters<typeof toPastCall>[0]);
    expect(call.outcome).toBe("practice");
    expect(call.minutes).toBe(2);
    expect(call.transcript).toEqual([
      { speaker: "customer", text: "Is parking included?", atMs: 4200 },
    ]);
    expect(call.cards).toEqual([
      { type: "answer", source: "playbook", text: "One covered space.", atMs: 4700 },
    ]);
  });

  it("lists this server's calls above the samples and opens one", async () => {
    serve();
    await renderRouter(routes, { initialUrl: "/history" });
    expect(await screen.findByText("Calls on this server")).toBeOnTheScreen();
    expect(screen.getByText("Spoken call")).toBeOnTheScreen();
    expect(screen.getByText("Sample calls")).toBeOnTheScreen();
    expect(screen.getByText("Layla Haddad")).toBeOnTheScreen();
  });

  it("shows a server call's transcript and cards", async () => {
    serve();
    await renderRouter(routes, { initialUrl: `/history/${CALL.id}` });
    expect(await screen.findByText("Is parking included?")).toBeOnTheScreen();
    expect(screen.getByText("One covered space.")).toBeOnTheScreen();
  });
});
