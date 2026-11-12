/** Admin → Team shows the real team and invites through the same API as Account (T-039). */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import TeamScreen from "../app/admin/index";
import { cloudApi } from "../lib/cloud";
import { LocaleProvider } from "../lib/locale";

let mockSignedIn = true;
jest.mock("../lib/useCloud", () => ({
  useCloud: () =>
    mockSignedIn
      ? {
          status: "signed_in",
          me: { user: { id: "u1", role: "admin" }, company: {} },
          bundle: null,
        }
      : { status: "off" },
}));
jest.mock("../lib/cloud", () => ({
  ...jest.requireActual("../lib/cloud"),
  cloudApi: jest.fn(),
}));

const TEAM = [
  { id: "u1", email: "rania@zylker.test", name: "Rania Haddad", role: "admin", active: true },
  { id: "u2", email: "omar@zylker.test", name: "Omar Saleh", role: "agent", active: true },
];

const wrap = () =>
  render(
    <LocaleProvider>
      <UIProvider direction="ltr">
        <TeamScreen />
      </UIProvider>
    </LocaleProvider>,
  );

describe("Admin → Team", () => {
  beforeEach(() => {
    mockSignedIn = true;
    jest.mocked(cloudApi).mockReset();
    jest
      .mocked(cloudApi)
      .mockImplementation(async (_path: string, init?: { method?: string }) =>
        init?.method === "POST" ? { temporary_password: "temp-1" } : { users: TEAM },
      );
  });

  it("lists the company's real team, not sample staff", async () => {
    await wrap();
    expect(await screen.findByText("Rania Haddad")).toBeOnTheScreen();
    expect(screen.getByText("omar@zylker.test")).toBeOnTheScreen();
    expect(screen.queryByText(/palmgrove/i)).toBeNull();
    expect(jest.mocked(cloudApi)).toHaveBeenCalledWith("/api/v1/team");
  });

  it("invites someone through the team API", async () => {
    await wrap();
    await screen.findByText("Rania Haddad");
    await fireEvent.changeText(screen.getByLabelText("Name"), "Lina Aziz");
    await fireEvent.changeText(screen.getByLabelText("Work email"), "lina@zylker.test");
    await fireEvent.press(screen.getByRole("button", { name: "Add a person" }));
    await waitFor(() =>
      expect(jest.mocked(cloudApi)).toHaveBeenCalledWith("/api/v1/team", {
        method: "POST",
        body: { email: "lina@zylker.test", name: "Lina Aziz", role: "agent" },
      }),
    );
  });

  it("says a Sotto account is needed when there is no server", async () => {
    mockSignedIn = false;
    await wrap();
    expect(screen.getByText("Team needs a Sales Shield account")).toBeOnTheScreen();
    expect(jest.mocked(cloudApi)).not.toHaveBeenCalled();
  });
});
