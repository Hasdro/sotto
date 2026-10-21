/** Agents and the call screen are told when the plan blocks calls (T-026). */
import { UIProvider } from "@sotto/ui";
import { render, screen } from "@testing-library/react-native";
import { PlanBanner } from "../components/PlanBanner";
import { LocaleProvider } from "../lib/locale";

let mockPath = "/call";
let mockRole = "agent";
let mockCompany: Record<string, unknown> = {};
jest.mock("expo-router", () => ({ usePathname: () => mockPath }));
jest.mock("../lib/role", () => ({ useRole: () => ({ role: mockRole }) }));
jest.mock("../lib/useCloud", () => ({
  useCloud: () => ({
    status: "signed_in",
    me: { user: { id: "u" }, company: mockCompany },
    bundle: null,
  }),
}));

const company = (over: Record<string, unknown>) => ({
  id: "c",
  name: "Acme",
  plan: "pro",
  status: "active",
  days_left: null,
  seats: 5,
  seats_used: 2,
  minutes_month: 1000,
  minutes_used: 10,
  can_call: true,
  blocked_reason: null,
  ...over,
});

const wrap = () =>
  render(
    <LocaleProvider>
      <UIProvider direction="ltr">
        <PlanBanner />
      </UIProvider>
    </LocaleProvider>,
  );

describe("calls paused line", () => {
  it.each([
    ["an agent on the call screen", "agent", "/call"],
    ["an agent on another page", "agent", "/history"],
    ["a manager on the call screen", "manager", "/call"],
  ])("tells %s that calls are paused and why", async (_who, role, path) => {
    mockRole = role;
    mockPath = path;
    mockCompany = company({ can_call: false, blocked_reason: "monthly minutes used up" });
    await wrap();
    expect(screen.getByTestId("calls-paused")).toBeOnTheScreen();
    expect(
      screen.getByText("Calls paused — the monthly minutes are used up. Ask your admin."),
    ).toBeOnTheScreen();
  });

  it("names an expired plan", async () => {
    mockRole = "agent";
    mockPath = "/call";
    mockCompany = company({ status: "expired", can_call: false, blocked_reason: "plan expired" });
    await wrap();
    expect(
      screen.getByText("Calls paused — the plan has expired. Ask your admin."),
    ).toBeOnTheScreen();
  });

  it("shows nothing to an agent while calls are allowed", async () => {
    mockRole = "agent";
    mockPath = "/call";
    mockCompany = company({});
    await wrap();
    expect(screen.queryByTestId("calls-paused")).toBeNull();
    expect(screen.queryByTestId("plan-banner")).toBeNull();
  });
});
