/** A real account never shows another company's sample calls or answers (T-024). */
import { screen } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import RootLayout from "../app/_layout";
import HistoryScreen from "../app/history/index";
import PlaybookScreen from "../app/playbook";
import { toPastCall } from "../features/history/server";

let mockReal = true;
jest.mock("../lib/cloud", () => ({
  ...jest.requireActual("../lib/cloud"),
  sampleDataAllowed: () => !mockReal,
}));

const routes = { _layout: RootLayout, "history/index": HistoryScreen, playbook: PlaybookScreen };

function serve(ok: boolean) {
  globalThis.fetch = jest.fn(async (url: string) => ({
    ok,
    status: ok ? 200 : 503,
    json: async () => (url.endsWith("/api/calls") ? { calls: [] } : { entries: [] }),
  })) as unknown as typeof fetch;
}

describe("real accounts show no sample data", () => {
  afterEach(() => {
    mockReal = true;
  });

  it("History shows an empty state instead of sample calls", async () => {
    serve(true);
    await renderRouter(routes, { initialUrl: "/history" });
    expect(await screen.findByText("No calls yet")).toBeOnTheScreen();
    expect(screen.queryByText("Sample calls")).toBeNull();
    expect(screen.queryByText("Layla Haddad")).toBeNull();
  });

  it("Playbook shows no sample answers while loading or when the server fails", async () => {
    serve(false);
    await renderRouter(routes, { initialUrl: "/playbook" });
    expect(await screen.findByText("No answers yet")).toBeOnTheScreen();
    expect(screen.queryByText(/Palm Grove/)).toBeNull();
  });

  it("Playbook with an empty company playbook says to add the first answer", async () => {
    serve(true);
    await renderRouter(routes, { initialUrl: "/playbook" });
    expect(await screen.findByText("No answers yet")).toBeOnTheScreen();
    expect(screen.queryByText(/Palm Grove/)).toBeNull();
  });

  it("the demo build still shows the samples", async () => {
    mockReal = false;
    serve(false);
    await renderRouter(routes, { initialUrl: "/history" });
    expect(await screen.findByText("Layla Haddad")).toBeOnTheScreen();
  });

  it("a call's outcome comes from the call: live calls are not practice", () => {
    const base = { id: "c", started_at: 0, ended_at: 60000, title: "t", cards: 0 };
    const nums = { p50_ms: null, p95_ms: null };
    expect(toPastCall({ ...base, ...nums, mode: "live" }).outcome).toBe("live");
    expect(toPastCall({ ...base, ...nums, mode: "fake" }).outcome).toBe("practice");
  });
});
