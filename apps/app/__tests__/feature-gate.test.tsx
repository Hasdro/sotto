/** Feature gate and Admin → Features (R7, D-028): greyed with a reason and an action when the
 * workflow needs the feature, hidden when the role does not, and the admin's org switches. */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import FeaturesScreen from "../app/admin/features";
import { FeatureGate } from "../components/FeatureGate";
import { FEATURE_IDS } from "../features/flags/catalog";
import { FLAG_TEXT } from "../features/flags/strings";
import { cloudApi } from "../lib/cloud";
import type { Locale } from "../lib/i18n";
import { LocaleProvider } from "../lib/locale";

let mockCloud: unknown = { status: "off" };
jest.mock("../lib/useCloud", () => ({ useCloud: () => mockCloud }));
jest.mock("../lib/cloud", () => ({ cloudApi: jest.fn(), refreshFeatures: jest.fn() }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (h: string) => mockPush(h) } }));

function signedIn(role: string, features: Record<string, unknown>) {
  mockCloud = { status: "signed_in", me: { user: { id: "u", role }, company: null, features } };
}

const wrap = (node: React.ReactNode, locale: Locale = "en") =>
  render(
    <LocaleProvider initial={locale}>
      <UIProvider direction={locale === "ar" ? "rtl" : "ltr"}>{node}</UIProvider>
    </LocaleProvider>,
  );
const child = <Text testID="inside">inside</Text>;

describe("FeatureGate", () => {
  beforeEach(() => mockPush.mockReset());

  it("shows the feature when there is no server (local demo) or it is available", async () => {
    mockCloud = { status: "off" };
    await wrap(<FeatureGate feature="reports">{child}</FeatureGate>);
    expect(screen.getByTestId("inside")).toBeOnTheScreen();
    signedIn("agent", { reports: { state: "available" } });
    await wrap(<FeatureGate feature="reports">{child}</FeatureGate>);
    expect(screen.getByTestId("inside")).toBeOnTheScreen();
  });

  it("hides a feature that is not for this role", async () => {
    signedIn("agent", { ai_knowledge: { state: "no_permission" } });
    await wrap(<FeatureGate feature="ai_knowledge">{child}</FeatureGate>);
    expect(screen.queryByTestId("inside")).toBeNull();
    expect(screen.queryByTestId("feature-off-ai_knowledge")).toBeNull();
  });

  it.each([
    ["off_by_platform", undefined, "Not included in your plan right now.", false],
    ["off_by_org", undefined, "Your admin turned this off.", false],
    ["needs_connection", "zoho", "Connect Zoho CRM to use this.", true],
    ["needs_connection", "release", "Coming in a later version.", false],
  ])("greys %s (%s) with a one-line reason", async (state, cause, reason, action) => {
    signedIn("agent", { zoho: { state, ...(cause ? { cause } : {}) } });
    await wrap(<FeatureGate feature="zoho">{child}</FeatureGate>);
    expect(screen.queryByTestId("inside")).toBeNull();
    expect(screen.getByTestId("feature-off-zoho")).toBeOnTheScreen();
    expect(screen.getByText(reason)).toBeOnTheScreen();
    expect(Boolean(screen.queryByTestId("feature-off-zoho-action"))).toBe(action);
  });

  it("offers an admin the way to turn an org-off feature back on", async () => {
    signedIn("admin", { reports: { state: "off_by_org" } });
    await wrap(<FeatureGate feature="reports">{child}</FeatureGate>);
    expect(screen.getByText("Turned off for your organization.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("feature-off-reports-action"));
    expect(mockPush).toHaveBeenCalledWith("/admin/features");
  });

  it("names the dependency that blocks a feature", async () => {
    signedIn("agent", { zoho: { state: "off_by_org", cause: "integrations" } });
    await wrap(<FeatureGate feature="zoho">{child}</FeatureGate>);
    expect(screen.getByText("Needs Integrations first.")).toBeOnTheScreen();
  });

  it("speaks Arabic in RTL", async () => {
    signedIn("agent", { reports: { state: "off_by_org" } });
    await wrap(<FeatureGate feature="reports">{child}</FeatureGate>, "ar");
    expect(screen.getByText("أوقف المسؤول هذه الميزة.")).toBeOnTheScreen();
    expect(screen.getByText("التقارير")).toBeOnTheScreen();
  });

  it("has every string in English and Arabic for every feature", () => {
    for (const locale of ["en", "ar"] as const) {
      for (const id of FEATURE_IDS) {
        expect(FLAG_TEXT[locale].name[id]).toBeTruthy();
        expect(FLAG_TEXT[locale].about[id]).toBeTruthy();
      }
    }
  });
});

describe("Admin → Features", () => {
  const rows = [
    { id: "reports", enabled: true, roles: ["admin", "manager", "agent"], state: "available" },
    {
      id: "zoho",
      enabled: true,
      roles: ["admin", "manager", "agent"],
      state: "needs_connection",
      cause: "release",
    },
  ];
  beforeEach(() => {
    signedIn("admin", {});
    jest.mocked(cloudApi).mockReset();
    jest.mocked(cloudApi).mockImplementation(async (_path: string, init?: { body?: unknown }) => {
      if (init?.body) {
        const on = (init.body as { enabled: boolean }).enabled;
        return {
          features: [{ ...rows[0], enabled: on, state: on ? "available" : "off_by_org" }, rows[1]],
        };
      }
      return { features: rows };
    });
  });

  it("lists the entitled features with state and reason, and saves a switch", async () => {
    await wrap(<FeaturesScreen />);
    expect(await screen.findByText("Reports")).toBeOnTheScreen();
    expect(screen.getByText("Coming in a later version.")).toBeOnTheScreen();
    await fireEvent(screen.getByTestId("feature-toggle-reports"), "valueChange", false);
    await waitFor(() =>
      expect(jest.mocked(cloudApi)).toHaveBeenCalledWith("/api/v1/company/features/reports", {
        method: "PUT",
        body: { enabled: false },
      }),
    );
    expect(await screen.findByText("Off for your organization")).toBeOnTheScreen();
    expect(screen.getByText("Saved.")).toBeOnTheScreen();
  });

  it("shows a feature switched off by AGN as a disabled, off switch labelled with the reason", async () => {
    jest.mocked(cloudApi).mockImplementation(async () => ({
      features: [
        { ...rows[0], enabled: true, state: "off_by_platform" },
        { id: "integrations", enabled: true, roles: ["admin"], state: "available" },
        { id: "gallabox", enabled: true, roles: ["admin"], state: "available" },
      ],
    }));
    await wrap(<FeaturesScreen />);
    const toggle = await screen.findByTestId("feature-toggle-reports");
    expect(toggle.props.disabled ?? toggle.props.accessibilityState?.disabled).toBeTruthy();
    expect(toggle.props.value).toBe(false);
    expect(toggle.props.accessibilityLabel).toBe("Reports: Not included in your plan right now.");
  });

  it("hides plumbing rows that follow a visible feature", async () => {
    jest.mocked(cloudApi).mockImplementation(async () => ({
      features: [
        rows[0],
        { id: "integrations", enabled: true, roles: ["admin"], state: "available" },
        { id: "gallabox", enabled: true, roles: ["admin"], state: "available" },
        { id: "learned_instructions", enabled: true, roles: ["admin"], state: "available" },
        { id: "prep", enabled: true, roles: ["admin"], state: "available" },
      ],
    }));
    await wrap(<FeaturesScreen />);
    expect(await screen.findByText("Reports")).toBeOnTheScreen();
    for (const id of ["integrations", "gallabox", "learned_instructions", "prep"]) {
      expect(screen.queryByTestId(`feature-toggle-${id}`)).toBeNull();
    }
  });
});
