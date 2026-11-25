import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SetupGuideView } from "../app/admin/setup";
import type { SetupFacts } from "../features/home/setup";
import { LocalModelsSettings } from "../features/settings/LocalModelsSettings";

describe("SetupGuideView (L2)", () => {
  it("shows role-specific steps, live status, Test it result, and Fix it navigation", async () => {
    const nav = jest.fn();
    const facts: SetupFacts = {
      role: "admin",
      zohoOffered: true,
      zohoConnected: true,
      audioChecked: false,
      playbookEntries: 0,
      seatsUsed: 1,
      messagingConnected: false,
      practiceOffered: true,
      markedDone: [],
    };
    await render(
      <UIProvider direction="ltr" scheme="light">
        <SetupGuideView facts={facts} onNavigate={nav} />
      </UIProvider>,
    );
    expect(screen.getByTestId("setup-guide")).toBeTruthy();
    expect(screen.getByText("Zoho: connected ✓")).toBeTruthy();
    expect(screen.getByText("WhatsApp / Email: not set up")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("setup-guide-fix-messaging"));
    expect(nav).toHaveBeenCalledWith("/admin/integrations");

    await fireEvent.press(screen.getByTestId("setup-guide-test-zoho"));
    await waitFor(() => {
      expect(screen.getByText("Zoho: connected ✓ (verified)")).toBeTruthy();
    });
  });
});

describe("LocalModelsSettings (L6, D-096)", () => {
  it("runs Test benchmark and reveals slow-model opt-in warning when > 1500 ms", async () => {
    const onSave = jest.fn();
    const onTest = jest.fn(async () => ({
      reachable: true,
      measuredMs: 2150,
      meetsR1: false,
      statusLabel: "Local model: connected ✓",
    }));

    await render(
      <UIProvider direction="ltr" scheme="light">
        <LocalModelsSettings onTest={onTest} onSave={onSave} />
      </UIProvider>,
    );

    await fireEvent.press(screen.getByTestId("local-model-test"));
    await waitFor(() => {
      expect(screen.getByTestId("local-model-status")).toBeTruthy();
      expect(screen.getByTestId("local-model-slow-warning")).toBeTruthy();
    });
    expect(screen.getByText(/2150 ms/)).toBeTruthy();
    expect(screen.getByText("Use it for live cards anyway")).toBeTruthy();
  });
});
