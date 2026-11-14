/** ZC-11c (D-049, D-062): one Company defaults page — tone, goal (prefilled), recording policy,
 * AI answers and the manager — each saved on its own; no agent-track toggle anywhere. */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import SettingsScreen from "../app/admin/settings";
import { LocaleProvider } from "../lib/locale";

const mockApi = jest.fn();
const mockChange = jest.fn();
jest.mock("../lib/cloud", () => ({
  cloudApi: (...a: unknown[]) => mockApi(...a),
  cloudOrigin: () => null,
}));
const mockCloud = {
  status: "signed_in",
  me: { user: { id: "u1", role: "admin" }, features: {} },
  bundle: { company: { tone: "warm and brief", call_goal: "book a site visit" } },
};
jest.mock("../lib/useCloud", () => ({ useCloud: () => mockCloud }));
jest.mock("../features/admin/settings", () => ({
  useCompanySettings: () => ({
    settings: { ai_answers_allowed: true, backup_allowed: true, card_language: "en" },
    change: mockChange,
  }),
}));

const DEFAULTS = {
  record_calls: "agent_choice",
  consent: null,
  vendor_allow_list: [],
  manager: { emails: ["mona@acme.test"], source: "managers" },
};

const wrap = (locale: "en" | "ar" = "en") =>
  render(
    <LocaleProvider initial={locale}>
      <UIProvider direction={locale === "ar" ? "rtl" : "ltr"}>
        <SettingsScreen />
      </UIProvider>
    </LocaleProvider>,
  );

describe("Company defaults", () => {
  beforeEach(() => {
    mockApi.mockReset();
    mockChange.mockReset();
    mockApi.mockImplementation(async (_p: string, init?: { method?: string; body?: object }) =>
      init?.method === "PUT" ? { ...DEFAULTS, ...init.body } : DEFAULTS,
    );
  });

  it("prefills tone and goal and saves each one for the next call", async () => {
    await wrap();
    expect(await screen.findByDisplayValue("warm and brief")).toBeOnTheScreen();
    expect(screen.getByDisplayValue("book a site visit")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId("defaults-tone"), "  formal,   short ");
    await fireEvent.press(screen.getByTestId("defaults-tone-save"));
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith("/api/v1/company/defaults", {
        method: "PUT",
        body: { tone: "formal, short" },
      }),
    );
    expect(await screen.findByText("Saved. Applies from the next call.")).toBeOnTheScreen();
  });

  it("sets the recording policy for the whole company", async () => {
    await wrap();
    await screen.findByTestId("defaults-manager");
    await fireEvent.press(screen.getByTestId("defaults-record-on"));
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith("/api/v1/company/defaults", {
        method: "PUT",
        body: { record_calls: "on" },
      }),
    );
    expect(
      await screen.findByText(
        "Every call is recorded. People see this in their Settings and cannot change it.",
      ),
    ).toBeOnTheScreen();
  });

  it("switches AI answers and shows who gets unanswered questions", async () => {
    await wrap();
    expect(
      await screen.findByText("They go to your sales managers: mona@acme.test."),
    ).toBeOnTheScreen();
    await fireEvent(screen.getByTestId("toggle-ai"), "valueChange", false);
    expect(mockChange).toHaveBeenCalledWith({ ai_answers_allowed: false });
    await fireEvent.changeText(screen.getByTestId("manager-email"), "boss@acme.test");
    await fireEvent.press(screen.getByTestId("manager-email-save"));
    expect(mockChange).toHaveBeenCalledWith({ manager_email: "boss@acme.test" });
  });

  it("has no agent-track context toggle (D-062) and no separate backup toggle", async () => {
    await wrap();
    await screen.findByTestId("defaults-manager");
    expect(screen.queryByText(/side of the call/i)).toBeNull();
    expect(screen.queryByTestId("toggle-backup")).toBeNull();
    await fireEvent.press(screen.getByTestId("defaults-advanced"));
    expect(screen.queryByText(/side of the call/i)).toBeNull();
  });

  it("shows a save error instead of failing silently", async () => {
    mockApi.mockImplementation(async (_p: string, init?: { method?: string }) => {
      if (init?.method === "PUT") throw new Error("offline");
      return DEFAULTS;
    });
    await wrap();
    await screen.findByTestId("defaults-manager");
    await fireEvent.press(screen.getByTestId("defaults-record-off"));
    expect(await screen.findByTestId("defaults-error")).toBeOnTheScreen();
  });
});
