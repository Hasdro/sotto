import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { LocaleProvider } from "../../../lib/locale";
import { CallStatePanel } from "./CallStatePanel";
import { splitCardWhy } from "./CardStack";
import { agentTalkShare, TalkMeter } from "./TalkMeter";

function wrap(ui: React.ReactNode) {
  return (
    <UIProvider>
      <LocaleProvider>{ui}</LocaleProvider>
    </UIProvider>
  );
}

describe("splitCardWhy (C1)", () => {
  it("splits main line and optional WHY insight", () => {
    const res = splitCardWhy(
      "Offer the 14-day pilot first.\nWHY: Lowers buyer friction while keeping urgency.",
    );
    expect(res.main).toBe("Offer the 14-day pilot first.");
    expect(res.why).toBe("Lowers buyer friction while keeping urgency.");
  });

  it("returns null why when absent", () => {
    const res = splitCardWhy("Ask what their launch date is.");
    expect(res.main).toBe("Ask what their launch date is.");
    expect(res.why).toBeNull();
  });
});

describe("CallStatePanel (C5)", () => {
  it("renders collapsed by default and opens on press", async () => {
    await render(wrap(<CallStatePanel state="Customer wants annual pricing. Stage: discovery." />));
    expect(screen.getByTestId("call-state-panel")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("call-state-toggle"));
    expect(screen.getByTestId("call-state-body")).toHaveTextContent("annual pricing");
  });
});

describe("TalkMeter (C8)", () => {
  it("computes rounded agent talk share", () => {
    expect(agentTalkShare(0, 0)).toBeNull();
    expect(agentTalkShare(3000, 7000)).toBe(30);
    expect(agentTalkShare(7000, 3000)).toBe(70);
  });

  it("hides completely in approximate mode", async () => {
    await render(wrap(<TalkMeter agentMs={5000} customerMs={5000} approximate />));
    expect(screen.queryByTestId("talk-meter")).toBeNull();
  });

  it("renders agent percentage when separate tracks are active", async () => {
    await render(wrap(<TalkMeter agentMs={4000} customerMs={6000} approximate={false} />));
    expect(screen.getByTestId("talk-meter")).toBeTruthy();
    expect(screen.getByTestId("talk-meter-pct")).toHaveTextContent("40%");
  });
});
