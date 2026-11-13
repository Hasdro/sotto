/** UX-34: the desktop app's Settings has one row pointing at the web admin for AI models. */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import SettingsScreen from "../app/admin/settings";
import { LocaleProvider } from "../lib/locale";

let mockDesktop: unknown = null;
jest.mock("../lib/desktop", () => ({ desktop: () => mockDesktop }));
jest.mock("../lib/cloud", () => ({ cloudOrigin: () => "https://sales.example.com" }));
jest.mock("../features/admin/settings", () => ({
  useCompanySettings: () => ({
    settings: {
      ai_answers_allowed: true,
      backup_allowed: true,
      agent_context: false,
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

describe("Settings → AI models", () => {
  it("desktop shows one row with an Open web admin button", async () => {
    mockDesktop = { platform: "darwin" };
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await wrap();
    expect(screen.getByText("AI models are managed in the web admin")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("settings-open-web-admin"));
    expect(open).toHaveBeenCalledWith("https://sales.example.com/admin/keys");
  });

  it("the web build does not show it", async () => {
    mockDesktop = null;
    await wrap();
    expect(screen.queryByTestId("settings-open-web-admin")).toBeNull();
  });
});
