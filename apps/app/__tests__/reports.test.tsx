/** Reports (owner, 22 Oct): tiles, charts and, for admins and managers, the agents table. */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen } from "@testing-library/react-native";
import ReportsScreen from "../app/reports";
import { cloudApi } from "../lib/cloud";
import { LocaleProvider } from "../lib/locale";

let mockRole = "admin";
jest.mock("../lib/useCloud", () => ({
  useCloud: () => ({ status: "signed_in", me: { user: { id: "u1", role: mockRole } } }),
}));
jest.mock("../lib/cloud", () => ({
  ...jest.requireActual("../lib/cloud"),
  cloudActive: () => true,
  cloudApi: jest.fn(),
}));

const row = {
  id: "co:c1",
  user_id: "u1",
  name: "Rania Haddad",
  started_at: Date.now() - 3600_000,
  duration_s: 300,
  cards: 6,
  playbook_cards: 3,
  ai_cards: 2,
  holding_lines: 1,
  escalations: 0,
  p50_ms: 640,
  p95_ms: 1000,
  source: "zoom",
  review: {
    scores: { opening: 7, discovery: 5, listening: 8, objections: 6, clarity: 9, next_step: 3 },
    success: 72,
    sentiment: "positive",
  },
};

const wrap = () =>
  render(
    <LocaleProvider>
      <UIProvider direction="ltr">
        <ReportsScreen />
      </UIProvider>
    </LocaleProvider>,
  );

describe("Reports", () => {
  beforeEach(() => {
    jest.mocked(cloudApi).mockReset();
    jest.mocked(cloudApi).mockResolvedValue({ calls: [row] });
  });

  it("shows the numbers, the charts and the agents table to an admin", async () => {
    mockRole = "admin";
    await wrap();
    expect((await screen.findAllByText("72%")).length).toBeGreaterThan(0);
    expect(screen.getByText("0.64 s")).toBeOnTheScreen();
    expect(screen.getByTestId("reports-days")).toBeOnTheScreen();
    expect(screen.getByText("Zoom")).toBeOnTheScreen();
    expect(screen.getByText("Rania Haddad")).toBeOnTheScreen();
    expect(screen.getByText("Coach: Next step")).toBeOnTheScreen();
    expect(jest.mocked(cloudApi)).toHaveBeenCalledWith("/api/v1/company/usage?days=30");
  });

  it("shows an agent their own numbers without the team table", async () => {
    mockRole = "agent";
    await wrap();
    await screen.findByText("72%");
    expect(screen.queryByTestId("reports-agents")).toBeNull();
  });

  it("shows a loading state instead of a blank page (UI-009)", async () => {
    mockRole = "admin";
    jest.mocked(cloudApi).mockReturnValue(new Promise(() => {}));
    await wrap();
    expect(screen.getByTestId("reports-loading")).toHaveTextContent("Loading reports…");
    expect(screen.queryByTestId("reports-days")).toBeNull();
  });

  it("gives Calls per day a scale, readable days and the count on busy days (UI-009)", async () => {
    mockRole = "admin";
    await wrap();
    await screen.findByTestId("reports-days");
    expect(screen.getByTestId("reports-days-axis")).toHaveTextContent(/^10$/);
    expect(screen.getByTestId("reports-days-first")).not.toHaveTextContent(/^\d\d-\d\d$/);
    expect(screen.getByTestId("reports-days-last")).toHaveTextContent(
      /Today|\d{1,2} [A-Z][a-z]{2}/,
    );
    expect(screen.getByLabelText(/: 1 call$/)).toBeOnTheScreen();
    expect(screen.queryByTestId(/^reports-day-value-/)).toBeNull(); // width unknown yet
    await fireEvent(screen.getByTestId("reports-days-bars"), "layout", {
      nativeEvent: { layout: { width: 900, height: 140, x: 0, y: 0 } },
    });
    const values = screen.getAllByTestId(/^reports-day-value-/);
    expect(values).toHaveLength(1);
    expect(values[0]).toHaveTextContent("1");
  });
});
