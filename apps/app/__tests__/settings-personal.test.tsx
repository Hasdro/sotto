/** ZC-map-agent (ZC A1, A3, A5): Settings is language/theme, Audio, the person's Zoho, Advanced
 * and About; no "Soon" placeholders; agents get no playbook guide (draft D-050 (backlog)). */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen } from "@testing-library/react-native";
import SettingsScreen from "../app/settings";
import { LocaleProvider } from "../lib/locale";
import { RoleProvider, type ViewRole } from "../lib/role";

let mockCloud: unknown = { status: "off" };
jest.mock("../lib/useCloud", () => ({ useCloud: () => mockCloud }));
jest.mock("../lib/cloud", () => ({
  APP_VERSION: "0.0.0-test",
  CloudError: class extends Error {},
  cloudApi: jest.fn(() => new Promise(() => {})),
  cloudOrigin: () => "https://sales.example.com",
  refreshFeatures: jest.fn(),
}));
jest.mock("../features/crm/useZoho", () => ({
  useZoho: () => ({
    status: { connected: false, feature: { state: "needs_connection" } },
    connect: jest.fn(),
  }),
  onReturn: () => () => {},
}));
jest.mock("../features/call/mic", () => ({ computerAudioAvailable: () => true }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (h: string) => mockPush(h) },
  useRouter: () => ({ push: (h: string) => mockPush(h) }),
}));

const signedIn = (role: ViewRole) => {
  mockCloud = {
    status: "signed_in",
    me: {
      user: { id: "u", role, name: "Sara" },
      company: null,
      features: { zoho: { state: "needs_connection", cause: "zoho" } },
    },
    bundle: null,
  };
};

const wrap = (role: ViewRole) =>
  render(
    <LocaleProvider initial="en">
      <RoleProvider initial={role}>
        <UIProvider direction="ltr">
          <SettingsScreen />
        </UIProvider>
      </RoleProvider>
    </LocaleProvider>,
  );

describe("personal Settings", () => {
  it("an agent sees Appearance, Audio, Zoho, Advanced and About, and no Soon badges", async () => {
    signedIn("agent");
    await wrap("agent");
    for (const id of ["settings-audio", "settings-zoho", "settings-advanced"])
      expect(screen.getByTestId(id)).toBeOnTheScreen();
    expect(screen.queryByText(/Coming next|Soon/i)).toBeNull();
    expect(screen.queryByTestId("settings-integrations")).toBeNull();
    expect(screen.queryByText("Playbook guide")).toBeNull();
    expect(screen.queryByTestId("settings-health")).toBeNull();
  });

  it("Audio re-runs the check on the call screen", async () => {
    signedIn("agent");
    await wrap("agent");
    await fireEvent.press(screen.getByTestId("settings-audio-check"));
    expect(mockPush).toHaveBeenCalledWith("/call?check=audio");
  });

  it("Advanced folds the mini window, sounds and auto pick-up", async () => {
    signedIn("agent");
    await wrap("agent");
    expect(screen.queryByTestId("settings-mini")).toBeNull();
    await fireEvent.press(screen.getByText("Advanced"));
    expect(screen.getByTestId("settings-mini")).toBeOnTheScreen();
    expect(screen.getByTestId("settings-autopickup")).toBeOnTheScreen();
    expect(screen.getByText("Sounds")).toBeOnTheScreen();
  });

  it("a manager also gets the playbook guide", async () => {
    signedIn("manager");
    await wrap("manager");
    await fireEvent.press(screen.getByText("Advanced"));
    expect(screen.getByText("Playbook guide")).toBeOnTheScreen();
  });

  it("shows the company's recording policy as a read-only line (D-049)", async () => {
    const { cloudApi } = jest.requireMock("../lib/cloud") as { cloudApi: jest.Mock };
    cloudApi.mockImplementation(async (path: string) =>
      path === "/api/v1/company/defaults" ? { record_calls: "on" } : new Promise(() => {}),
    );
    signedIn("agent");
    await wrap("agent");
    await fireEvent.press(screen.getByText("Advanced"));
    expect(await screen.findByTestId("settings-record-policy")).toHaveTextContent("Always on");
    expect(screen.getByText("Your company records every call.")).toBeOnTheScreen();
    expect(screen.queryByTestId("settings-record")).toBeNull();
    cloudApi.mockImplementation(() => new Promise(() => {}));
  });

  it("keeps the personal recording switch while each person chooses", async () => {
    signedIn("agent");
    await wrap("agent");
    await fireEvent.press(screen.getByText("Advanced"));
    expect(screen.getByTestId("settings-record")).toBeOnTheScreen();
  });
});
