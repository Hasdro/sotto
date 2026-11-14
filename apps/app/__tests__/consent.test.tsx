/** DD-4 (D-063): "Who processes your calls" on admin first run and on Company defaults; the
 * choice + timestamp is stored (audited on the server); "primary vendors only" drops the backups
 * from the allow-list and turns backups off; the DRAFT marker shows in English and Arabic. */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ConsentStep, resetConsentStep } from "../features/admin/ConsentStep";
import { CONSENT_TEXT_VERSION, PRIMARY_VENDORS, SUBPROCESSORS } from "../features/admin/consentText";
import { LocaleProvider } from "../lib/locale";

const mockApi = jest.fn();
const mockChange = jest.fn();
jest.mock("../lib/cloud", () => ({ cloudApi: (...a: unknown[]) => mockApi(...a) }));
let mockRole = "admin";
jest.mock("../lib/useCloud", () => ({
  useCloud: () => ({
    status: "signed_in",
    me: { user: { id: "u1", role: mockRole }, features: {} },
    bundle: null,
  }),
}));
jest.mock("../features/admin/settings", () => ({
  useCompanySettings: () => ({ settings: {}, change: mockChange }),
}));

const NONE = {
  record_calls: "agent_choice",
  consent: null,
  vendor_allow_list: [],
  manager: { emails: [], source: "none" },
};

const wrap = (locale: "en" | "ar" = "en") =>
  render(
    <LocaleProvider initial={locale}>
      <UIProvider direction={locale === "ar" ? "rtl" : "ltr"}>
        <ConsentStep />
      </UIProvider>
    </LocaleProvider>,
  );

describe("AI-vendor consent step", () => {
  beforeEach(() => {
    resetConsentStep();
    mockRole = "admin";
    mockApi.mockReset();
    mockChange.mockReset();
    mockApi.mockImplementation(async (_p: string, init?: { method?: string; body?: object }) =>
      init?.method === "PUT"
        ? {
            ...NONE,
            vendor_allow_list: (init.body as { vendor_allow_list: string[] }).vendor_allow_list,
            consent: { choice: "primary_only", accepted_by: "u1", accepted_at: 1, text_version: "draft-1" },
          }
        : NONE,
    );
  });

  it("drafts the list from the AGN routing: primary and backup vendors", () => {
    expect(PRIMARY_VENDORS).toEqual(["assemblyai", "groq"]);
    expect(SUBPROCESSORS.filter((v) => v.backup).map((v) => v.id)).toEqual([
      "speechmatics",
      "gemini",
    ]);
  });

  it("opens on admin first run with the DRAFT marker and the full vendor list", async () => {
    await wrap();
    expect(await screen.findByTestId("consent-step")).toBeOnTheScreen();
    expect(screen.getByText("DRAFT — not legal text")).toBeOnTheScreen();
    for (const v of SUBPROCESSORS) expect(screen.getByTestId(`vendor-${v.id}`)).toBeOnTheScreen();
  });

  it("shows the DRAFT marker in Arabic too", async () => {
    await wrap("ar");
    expect(await screen.findByText("مسودة — ليست نصًا قانونيًا")).toBeOnTheScreen();
    expect(screen.getByText("من يعالج مكالماتك")).toBeOnTheScreen();
  });

  it("'primary vendors only' stores the choice, drops the backups and turns backups off", async () => {
    await wrap();
    await fireEvent(await screen.findByTestId("consent-primary-only"), "valueChange", true);
    expect(screen.queryByTestId("vendor-gemini")).toBeNull();
    await fireEvent.press(screen.getByTestId("consent-save"));
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith("/api/v1/company/defaults", {
        method: "PUT",
        body: {
          consent: { choice: "primary_only", text_version: CONSENT_TEXT_VERSION },
          vendor_allow_list: ["assemblyai", "groq"],
        },
      }),
    );
    expect(mockChange).toHaveBeenCalledWith({ backup_allowed: false });
    await waitFor(() => expect(screen.queryByTestId("consent-step")).toBeNull());
  });

  it("'Later' closes it for this visit; a recorded choice never opens it", async () => {
    await wrap();
    await fireEvent.press(await screen.findByTestId("consent-later"));
    expect(screen.queryByTestId("consent-step")).toBeNull();
    resetConsentStep();
    mockApi.mockImplementation(async () => ({
      ...NONE,
      consent: { choice: "all", accepted_by: "u1", accepted_at: 1, text_version: "draft-1" },
    }));
    await wrap();
    await waitFor(() => expect(mockApi).toHaveBeenCalled());
    expect(screen.queryByTestId("consent-step")).toBeNull();
  });

  it("is never shown to managers or agents", async () => {
    mockRole = "manager";
    await wrap();
    expect(screen.queryByTestId("consent-step")).toBeNull();
    expect(mockApi).not.toHaveBeenCalled();
  });
});
