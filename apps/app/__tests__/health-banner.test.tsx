/** ZC-14c: one banner from the server's config health, with a fix link; never more than one. */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ShellBanner } from "../components/AppShell";
import { healthReasonFor } from "../components/HealthBanner";
import type { ConfigHealth } from "../lib/cloud";
import { LocaleProvider } from "../lib/locale";
import { RoleProvider, type ViewRole } from "../lib/role";

let mockHealth: ConfigHealth = { status: "ok", reasons: [] };
let mockCompany: Record<string, unknown> = {};
jest.mock("../lib/cloud", () => ({
  configHealth: () => mockHealth,
  cloudOrigin: () => "https://sales.example.com",
}));
jest.mock("../lib/useCloud", () => ({
  useCloud: () => ({
    status: "signed_in",
    me: { user: { id: "u" }, company: mockCompany },
    bundle: null,
  }),
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  usePathname: () => "/home",
  router: { push: (h: string) => mockPush(h) },
}));

const company = (over: Record<string, unknown> = {}) => ({
  id: "c",
  name: "Acme",
  status: "trial",
  days_left: 3,
  seats: 5,
  seats_used: 2,
  minutes_month: 300,
  minutes_used: 10,
  can_call: true,
  blocked_reason: null,
  ...over,
});
const zoho = { code: "zoho_token_expired", fix: "/settings#zoho" } as const;
const smtp = { code: "smtp_failing", fix: "/admin/integrations#email" } as const;

const wrap = (role: ViewRole) =>
  render(
    <LocaleProvider initial="en">
      <RoleProvider initial={role}>
        <UIProvider direction="ltr">
          <ShellBanner />
        </UIProvider>
      </RoleProvider>
    </LocaleProvider>,
  );

beforeEach(() => {
  mockPush.mockReset();
  mockCompany = company();
});

describe("config health banner", () => {
  it("needs_attention shows exactly one banner with the fix link", async () => {
    mockHealth = { status: "needs_attention", reasons: [smtp, zoho] };
    await wrap("admin");
    expect(screen.getAllByTestId("health-banner")).toHaveLength(1);
    expect(screen.queryByTestId("plan-banner")).toBeNull(); // the trial line waits its turn
    expect(screen.getByText("Follow-up emails are not sending.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("health-fix"));
    expect(mockPush).toHaveBeenCalledWith("/admin/integrations#email");
  });

  it("ok shows no health banner (the trial line may show for admins)", async () => {
    mockHealth = { status: "ok", reasons: [] };
    await wrap("admin");
    expect(screen.queryByTestId("health-banner")).toBeNull();
    expect(screen.getByTestId("plan-banner")).toBeOnTheScreen();
  });

  it("an agent only sees what is theirs to fix", async () => {
    mockHealth = { status: "needs_attention", reasons: [smtp] };
    await wrap("agent");
    expect(screen.queryByTestId("health-banner")).toBeNull();
    expect(healthReasonFor({ status: "needs_attention", reasons: [smtp, zoho] }, "agent")).toEqual(
      zoho,
    );
  });

  it("calls paused outranks the health line", async () => {
    mockHealth = { status: "needs_attention", reasons: [zoho] };
    mockCompany = company({ status: "expired", can_call: false });
    await wrap("agent");
    expect(screen.getByTestId("calls-paused")).toBeOnTheScreen();
    expect(screen.queryByTestId("health-banner")).toBeNull();
  });
});
