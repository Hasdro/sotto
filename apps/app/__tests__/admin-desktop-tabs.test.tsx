/** D-038 + D-039: on the desktop app the model/keys tab moves to the web admin panel, while
 * Integrations (Zoho, SMTP, Gallabox) stays in the app. */
import { UIProvider } from "@sotto/ui";
import { render, screen } from "@testing-library/react-native";
import AdminLayout from "../app/admin/_layout";
import { LocaleProvider } from "../lib/locale";

let mockDesktop: unknown = null;
jest.mock("../lib/desktop", () => ({ desktop: () => mockDesktop }));
jest.mock("../components/RoleGate", () => ({
  RoleGate: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("../features/learning/badge", () => ({ useLearningBadge: () => 0 }));
jest.mock("expo-router", () => ({
  Slot: () => null,
  usePathname: () => "/admin",
  router: { push: jest.fn() },
  useRouter: () => ({ push: jest.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const wrap = () =>
  render(
    <LocaleProvider initial="en">
      <UIProvider direction="ltr">
        <AdminLayout />
      </UIProvider>
    </LocaleProvider>,
  );

describe("admin tabs", () => {
  it("web shows Keys and Integrations", async () => {
    mockDesktop = null;
    await wrap();
    expect(screen.getByText("Integrations")).toBeTruthy();
    expect(screen.queryByText("Keys & providers")).toBeTruthy();
  });

  it("desktop hides Keys (models) but keeps Integrations", async () => {
    mockDesktop = { platform: "darwin" };
    await wrap();
    expect(screen.getByText("Integrations")).toBeTruthy();
    expect(screen.queryByText("Keys & providers")).toBeNull();
  });
});
