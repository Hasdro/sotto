/** UX-29, draft D-051 (backlog) (+ D-038, D-039): the admin area in four groups; on the desktop app Keys &
 * providers moves to the web admin panel, while Integrations (Zoho, SMTP, Gallabox) stays. */
import { UIProvider } from "@sotto/ui";
import { render, screen } from "@testing-library/react-native";
import AdminLayout from "../app/admin/_layout";
import { LocaleProvider } from "../lib/locale";

let mockDesktop: unknown = null;
let mockPath = "/admin";
jest.mock("../lib/desktop", () => ({ desktop: () => mockDesktop }));
jest.mock("../components/RoleGate", () => ({
  RoleGate: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("../features/learning/badge", () => ({ useLearningBadge: () => 0 }));
jest.mock("../features/webadmin/webAdmin", () => ({
  ...jest.requireActual("../features/webadmin/webAdmin"),
  webAdminUrl: () => "https://sales.example.com/admin",
}));
jest.mock("expo-router", () => ({
  Slot: () => null,
  usePathname: () => mockPath,
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

describe("admin groups", () => {
  beforeEach(() => {
    mockPath = "/admin";
  });

  it("shows four groups: People, Connections, AI, Company", async () => {
    mockDesktop = null;
    await wrap();
    for (const id of ["people", "connections", "ai", "company"])
      expect(screen.getByTestId(`admin-group-${id}`)).toBeOnTheScreen();
    expect(screen.getByTestId("admin-group-people")).toHaveTextContent("People");
    expect(screen.getByTestId("admin-group-people")).toBeSelected();
  });

  it("web shows Keys and Integrations under Connections", async () => {
    mockDesktop = null;
    mockPath = "/admin/integrations";
    await wrap();
    expect(screen.getByTestId("admin-group-connections")).toBeSelected();
    expect(screen.getByText("Integrations")).toBeTruthy();
    expect(screen.getByText("Keys & providers")).toBeTruthy();
  });

  it("desktop has no Keys & providers entry but keeps Integrations (D-038)", async () => {
    mockDesktop = { platform: "darwin" };
    mockPath = "/admin/integrations";
    await wrap();
    expect(screen.queryByText("Keys & providers")).toBeNull();
    // Connections: Integrations and (T-081, INT-14b) Attachments; Keys stays web-only.
    expect(screen.getByTestId("admin-page-integrations")).toBeTruthy();
    expect(screen.getByTestId("admin-page-attachments")).toBeTruthy();
    expect(screen.queryByTestId("admin-page-keys")).toBeNull();
    expect(screen.getByTestId("admin-group-connections")).toBeSelected();
  });

  it("desktop AI group links to the web admin for models", async () => {
    mockDesktop = { platform: "darwin" };
    mockPath = "/admin/instructions";
    await wrap();
    expect(screen.getByTestId("admin-web-models")).toBeOnTheScreen();
  });

  it.each(["/admin/company", "/admin/recordings", "/admin/devices", "/admin/activity"])(
    "%s sits under Company › Company activity",
    async (path) => {
      mockDesktop = { platform: "darwin" };
      mockPath = path;
      await wrap();
      expect(screen.getByTestId("admin-group-company")).toBeSelected();
      expect(screen.getByTestId("admin-page-company")).toBeSelected();
    },
  );
});
