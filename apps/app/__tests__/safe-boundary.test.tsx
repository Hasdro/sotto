import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text as RNText, View } from "react-native";
import { SafeBoundary } from "../components/SafeBoundary";
import { clearEvents, recentEvents } from "../lib/obs";

function Boom({ shouldThrow }: { shouldThrow: boolean | (() => boolean) }) {
  if (typeof shouldThrow === "function" ? shouldThrow() : shouldThrow)
    throw new Error("panel exploded");
  return <RNText testID="recovered-panel">Recovered OK</RNText>;
}

describe("SafeBoundary (S2)", () => {
  const origError = console.error;
  beforeEach(() => {
    clearEvents();
    console.error = jest.fn();
  });
  afterEach(() => {
    console.error = origError;
  });

  it("shows fallback + Retry on error, logs metadata via obs, and recovers on Retry", async () => {
    let fail = true;
    function Wrapper() {
      return (
        <UIProvider direction="ltr" scheme="light">
          <SafeBoundary name="wizard.step2">
            <Boom shouldThrow={() => fail} />
          </SafeBoundary>
        </UIProvider>
      );
    }
    await render(<Wrapper />);
    expect(screen.getByTestId("safe-boundary-wizard.step2")).toBeTruthy();
    expect(screen.getByText("This part didn't load")).toBeTruthy();
    const events = recentEvents(5);
    expect(
      events.some((e) => e.stage === "ui.boundary" && e.meta.boundary === "wizard.step2"),
    ).toBe(true);

    fail = false;
    await fireEvent.press(screen.getByTestId("safe-boundary-retry-wizard.step2"));
    expect(screen.getByTestId("recovered-panel")).toBeTruthy();
  });

  it("isolates a failing side panel so the live card area survives", async () => {
    await render(
      <UIProvider direction="ltr" scheme="light">
        <View>
          <SafeBoundary name="call.cards">
            <RNText testID="live-card-area">Live suggestion card</RNText>
          </SafeBoundary>
          <SafeBoundary name="call.rail">
            <Boom shouldThrow />
          </SafeBoundary>
        </View>
      </UIProvider>,
    );
    expect(screen.getByTestId("live-card-area")).toBeTruthy();
    expect(screen.getByText("Live suggestion card")).toBeTruthy();
    expect(screen.getByTestId("safe-boundary-call.rail")).toBeTruthy();
  });
});
