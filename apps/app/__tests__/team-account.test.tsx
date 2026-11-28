/** UX-014: Account no longer repeats Admin › People for admins (a link instead; managers keep the
 * read-only list), and Admin › People says when every seat is taken instead of offering a form
 * that cannot work. */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen } from "@testing-library/react-native";
import AccountScreen from "../app/account";
import { TeamPanel } from "../features/team/TeamPanel";
import { LocaleProvider } from "../lib/locale";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock("../lib/cloud", () => ({
  ...jest.requireActual("../lib/cloud"),
  cloudApi: jest.fn(async (path: string) =>
    path === "/api/v1/team"
      ? {
          users: [
            {
              id: "m1",
              name: "Omar Haddad",
              email: "omar@example.test",
              role: "agent",
              active: true,
            },
          ],
        }
      : { devices: [] },
  ),
  cloudOrigin: () => "",
}));
let mockRole = "admin";
let mockSeats = { seats: 3, seats_used: 2 };
jest.mock("../lib/useCloud", () => ({
  useCloud: () => ({
    status: "signed_in",
    me: {
      user: { id: "u1", name: "Hana Saleh", role: mockRole },
      company: {
        id: "co-1",
        name: "Acme",
        status: "trial",
        days_left: 50,
        can_call: true,
        minutes_used: 92,
        minutes_month: 300,
        ...mockSeats,
      },
      features: {},
    },
    bundle: null,
  }),
}));

const wrap = (ui: React.ReactElement) =>
  render(
    <LocaleProvider initial="en">
      <UIProvider direction="ltr">{ui}</UIProvider>
    </LocaleProvider>,
  );

beforeEach(() => {
  mockPush.mockReset();
  mockRole = "admin";
  mockSeats = { seats: 3, seats_used: 2 };
});

describe("Account › Team (UX-014)", () => {
  it("sends admins to Admin › People instead of repeating the form", async () => {
    await wrap(<AccountScreen />);
    expect(screen.queryByText("Add a person")).toBeNull();
    await fireEvent.press(screen.getByTestId("account-team-open"));
    expect(mockPush).toHaveBeenCalledWith("/admin");
  });

  it("keeps the read-only team list for managers, who cannot open Admin", async () => {
    mockRole = "manager";
    await wrap(<AccountScreen />);
    expect(await screen.findByText("Omar Haddad")).toBeOnTheScreen();
    expect(screen.queryByText("Add a person")).toBeNull();
    expect(screen.queryByTestId("account-team-open")).toBeNull();
  });
});

describe("Admin › People seats (UX-014)", () => {
  it("says every seat is taken and offers no invite that cannot work", async () => {
    mockSeats = { seats: 3, seats_used: 3 };
    await wrap(<TeamPanel team={[]} canInvite onChange={jest.fn()} />);
    expect(screen.getByTestId("team-seats-full")).toHaveTextContent(/All 3 seats are in use/);
    expect(screen.getByTestId("team-invite")).toBeDisabled();
  });

  it("lets an admin invite while a seat is free", async () => {
    await wrap(<TeamPanel team={[]} canInvite onChange={jest.fn()} />);
    expect(screen.queryByTestId("team-seats-full")).toBeNull();
    await fireEvent.changeText(screen.getByTestId("team-invite-name"), "Rania");
    await fireEvent.changeText(screen.getByTestId("team-invite-email"), "rania@example.test");
    expect(screen.getByTestId("team-invite")).not.toBeDisabled();
  });
});
