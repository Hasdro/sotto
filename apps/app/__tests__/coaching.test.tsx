/** INT-05: Coaching — an agent sees only themselves, a manager the team, nobody is ranked; the
 * weekly email is opt-in with a preview (managers and admins only). */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import CoachingScreen from "../app/coaching";
import { LocaleProvider } from "../lib/locale";

const mockApi = jest.fn();
jest.mock("../lib/cloud", () => ({ cloudApi: (...a: unknown[]) => mockApi(...a) }));
let mockRole = "agent";
jest.mock("../lib/useCloud", () => ({
  useCloud: () => ({
    status: "signed_in",
    me: { user: { id: "u1", role: mockRole }, features: {} },
    bundle: null,
  }),
}));

const person = (id: string, name: string, me = false) => ({
  user_id: id,
  name,
  role: "agent",
  me,
  calls: 4,
  rated: 6,
  not_helpful: 2,
  rejected: { objection: 2 },
  reasons: { wrong: 2 },
  objections: { price: 3 },
  skills: { opening: 7, discovery: 3.5 },
  weakest: "discovery",
});

const wrap = (locale: "en" | "ar" = "en") =>
  render(
    <LocaleProvider initial={locale}>
      <UIProvider direction={locale === "ar" ? "rtl" : "ltr"}>
        <CoachingScreen />
      </UIProvider>
    </LocaleProvider>,
  );

describe("Coaching", () => {
  beforeEach(() => mockApi.mockReset());

  it("an agent sees only their own practice points, no email or team parts", async () => {
    mockRole = "agent";
    mockApi.mockResolvedValue({
      scope: "self",
      days: 30,
      ranking: false,
      people: [person("u1", "Omar", true)],
      objections: { price: 3 },
      learned: [],
    });
    await wrap();
    expect(await screen.findByText("Your own calls, last 30 days.")).toBeOnTheScreen();
    expect(screen.getByText("Practise: Discovery (3.5/10 on average)")).toBeOnTheScreen();
    expect(screen.getByText("You")).toBeOnTheScreen();
    expect(screen.queryByTestId("coaching-weekly")).toBeNull();
    expect(screen.queryByTestId("coaching-objections")).toBeNull();
    expect(screen.queryByTestId("coaching-no-ranking")).toBeNull();
  });

  it("a manager sees the team by name with no ranking, and can preview the weekly email", async () => {
    mockRole = "manager";
    mockApi.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path.startsWith("/api/v1/coaching?"))
        return {
          scope: "team",
          days: 30,
          ranking: false,
          people: [person("m", "Mona", true), person("a", "Omar"), person("b", "Zara")],
          objections: { price: 6, timing: 1 },
          learned: ["Name the next step."],
        };
      if (path === "/api/v1/coaching/digest/preview")
        return { sent: true, subject: "s", text: "t" };
      if (path === "/api/v1/coaching/digest")
        return { weekly: init?.method === "PUT", last_sent_at: null };
      return {};
    });
    await wrap();
    expect(await screen.findByTestId("coaching-no-ranking")).toBeOnTheScreen();
    expect(screen.getByTestId("coach-a")).toBeOnTheScreen();
    expect(screen.getByTestId("coach-b")).toBeOnTheScreen();
    expect(screen.getByText("Name the next step.", { exact: false })).toBeOnTheScreen();
    expect(screen.queryByTestId("coaching-edit-learned")).toBeNull(); // admins only
    await fireEvent(screen.getByTestId("coaching-weekly"), "valueChange", true);
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith("/api/v1/coaching/digest", {
        method: "PUT",
        body: { weekly: true },
      }),
    );
    await fireEvent.press(screen.getByTestId("coaching-preview"));
    expect(await screen.findByText("Sent. Check your inbox.")).toBeOnTheScreen();
  });

  it("works in Arabic", async () => {
    mockRole = "agent";
    mockApi.mockResolvedValue({
      scope: "self",
      days: 30,
      ranking: false,
      people: [person("u1", "عمر", true)],
      objections: {},
      learned: [],
    });
    await wrap("ar");
    expect(await screen.findByText("مكالماتك أنت، آخر 30 يومًا.")).toBeOnTheScreen();
  });
});
