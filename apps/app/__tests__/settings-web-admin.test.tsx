/** D-078: model management lives in the owner console only; Settings shows none. */
import { UIProvider } from "@sotto/ui";
import { render, screen } from "@testing-library/react-native";
import SettingsScreen from "../app/admin/settings";
import { LocaleProvider } from "../lib/locale";

let mockDesktop: unknown = null;
const mockOff = { status: "off" };
jest.mock("../lib/desktop", () => ({ desktop: () => mockDesktop }));
jest.mock("../lib/cloud", () => ({
  cloudOrigin: () => "https://sales.example.com",
  cloudState: () => mockOff,
  subscribeCloud: () => () => {},
}));
jest.mock("../features/admin/settings", () => ({
  useCompanySettings: () => ({
    settings: {
      ai_answers_allowed: true,
      backup_allowed: true,
      card_language: "auto",
      manager_email: null,
    },
    change: jest.fn(),
  }),
}));

const wrap = () =>
  render(
    <LocaleProvider initial="en">
      <UIProvider direction="ltr">
        <SettingsScreen />
      </UIProvider>
    </LocaleProvider>,
  );

describe("Settings → AI models (D-078)", () => {
  it.each([{ platform: "darwin" }, null])("shows no model management (%j)", async (d) => {
    mockDesktop = d;
    await wrap();
    expect(screen.queryByTestId("settings-open-web-admin")).toBeNull();
    expect(screen.queryByText("AI models are managed in the web admin")).toBeNull();
  });
});
