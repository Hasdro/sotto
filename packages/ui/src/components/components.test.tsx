import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { UIProvider } from "../theme.tsx";
import { minTouchTarget, themes } from "../tokens.ts";
import { Badge } from "./Badge.tsx";
import { Button } from "./Button.tsx";
import { EmptyState } from "./EmptyState.tsx";
import { Panel, Screen, Stack } from "./layout.tsx";
import { SegmentedControl } from "./SegmentedControl.tsx";
import { Table } from "./Table.tsx";
import { Text } from "./Text.tsx";
import { TextField } from "./TextField.tsx";
import { Toast } from "./Toast.tsx";
import { ToggleRow } from "./ToggleRow.tsx";
import { TranscriptLine } from "./TranscriptLine.tsx";
import { Wordmark } from "./Wordmark.tsx";

describe("Button", () => {
  it("is a labelled button that fires onPress", async () => {
    const onPress = jest.fn();
    await render(<Button label="Start call" onPress={onPress} />);
    await fireEvent.press(screen.getByRole("button", { name: "Start call" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not fire when disabled and says so to assistive tech", async () => {
    const onPress = jest.fn();
    await render(<Button label="Send" onPress={onPress} disabled testID="b" />);
    await fireEvent.press(screen.getByTestId("b"));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByTestId("b")).toHaveProp("accessibilityState", { disabled: true });
  });

  it.each(["md", "lg"] as const)("size %s meets the 44 pt touch target", async (size) => {
    await render(<Button label="x" size={size} testID="b" />);
    const style = StyleSheet.flatten(screen.getByTestId("b").props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(minTouchTarget);
    expect(style.minWidth).toBeGreaterThanOrEqual(minTouchTarget);
  });

  it("danger uses the danger token", async () => {
    await render(<Button label="End call" variant="danger" testID="b" />);
    expect(screen.getByTestId("b")).toHaveStyle({ backgroundColor: themes.light.color.danger });
  });
});

describe("Badge", () => {
  it("renders its label with the card palette of its tone", async () => {
    await render(
      <UIProvider scheme="dark">
        <Badge label="Live AI" tone="answer" testID="b" />
      </UIProvider>,
    );
    expect(screen.getByText("Live AI")).toBeOnTheScreen();
    expect(screen.getByTestId("b")).toHaveStyle({ backgroundColor: themes.dark.card.answer.fill });
  });
});

describe("TranscriptLine", () => {
  it("shows speaker, time and text", async () => {
    await render(
      <TranscriptLine speaker="customer" speakerLabel="Customer" text="Is it free?" time="00:12" />,
    );
    expect(screen.getByText("Customer")).toBeOnTheScreen();
    expect(screen.getByText("00:12")).toBeOnTheScreen();
    expect(screen.getByText("Is it free?")).toBeOnTheScreen();
  });

  it("mutes the agent's own words", async () => {
    await render(<TranscriptLine speaker="agent" speakerLabel="You" text="Sure." />);
    expect(screen.getByText("Sure.")).toHaveStyle({ color: themes.light.color.textMuted });
  });

  it("system lines use the notice style", async () => {
    await render(
      <TranscriptLine speaker="system" speakerLabel="Sent to your manager" text="Q?" testID="l" />,
    );
    expect(screen.getByTestId("l")).toHaveStyle({ backgroundColor: themes.light.color.noticeFill });
  });
});

describe("EmptyState", () => {
  it("shows title, body, command and a working action", async () => {
    const onPress = jest.fn();
    await render(
      <EmptyState
        title="Not running"
        body="Start it."
        code="pnpm demo"
        action={{ label: "Try again", onPress }}
      />,
    );
    expect(screen.getByRole("header", { name: "Not running" })).toBeOnTheScreen();
    expect(screen.getByText("pnpm demo")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(onPress).toHaveBeenCalled();
  });
});

describe("SegmentedControl", () => {
  it("marks the selected option and reports changes", async () => {
    const onChange = jest.fn();
    await render(
      <SegmentedControl
        accessibilityLabel="Who"
        options={[
          { value: "customer", label: "Customer" },
          { value: "agent", label: "You" },
        ]}
        value="customer"
        onChange={onChange}
        testID="s"
      />,
    );
    expect(screen.getByTestId("s-customer")).toHaveProp("accessibilityState", { checked: true });
    await fireEvent.press(screen.getByTestId("s-agent"));
    expect(onChange).toHaveBeenCalledWith("agent");
  });
});

describe("ToggleRow", () => {
  it("is a labelled switch", async () => {
    const onValueChange = jest.fn();
    await render(<ToggleRow label="Backup AI" value onValueChange={onValueChange} testID="t" />);
    expect(screen.getByTestId("t")).toHaveProp("accessibilityLabel", "Backup AI");
    await fireEvent(screen.getByTestId("t"), "valueChange", false);
    expect(onValueChange).toHaveBeenCalledWith(false);
  });
});

describe("TextField", () => {
  it("uses its visible label as the accessible name", async () => {
    await render(<TextField label="Search" placeholder="Type" testID="f" />);
    expect(screen.getByTestId("f")).toHaveProp("accessibilityLabel", "Search");
  });
});

describe("Table", () => {
  const props = {
    accessibilityLabel: "Team",
    columns: [
      { key: "name", title: "Name" },
      { key: "role", title: "Role" },
    ],
    rows: [{ id: "1", cells: { name: "Hana", role: "Admin" } }],
  };

  it("renders a header row and cells", async () => {
    await render(<Table {...props} />);
    expect(screen.getByText("Name")).toBeOnTheScreen();
    expect(screen.getByText("Hana")).toBeOnTheScreen();
  });

  it("stacked mode labels each value", async () => {
    await render(<Table {...props} stacked />);
    expect(screen.getByText("Role")).toBeOnTheScreen();
    expect(screen.getByText("Admin")).toBeOnTheScreen();
  });
});

describe("small primitives", () => {
  it("Text uses the type scale and tone tokens", async () => {
    await render(
      <Text variant="title" tone="muted">
        Hello
      </Text>,
    );
    expect(screen.getByText("Hello")).toHaveStyle({
      fontSize: 24,
      color: themes.light.color.textMuted,
    });
  });

  it("Toast is announced politely", async () => {
    await render(<Toast title="Sent to your manager" body="Q?" testID="t" />);
    expect(screen.getByTestId("t")).toHaveProp("accessibilityLiveRegion", "polite");
  });

  it("Wordmark is a header with the product name", async () => {
    await render(<Wordmark name="sotto" />);
    expect(screen.getByRole("header", { name: "sotto" })).toBeOnTheScreen();
  });

  it("Screen, Stack and Panel lay out children on theme surfaces", async () => {
    await render(
      <UIProvider scheme="dark">
        <Screen testID="s">
          <Stack gap="lg">
            <Panel testID="p">
              <Text>Inside</Text>
            </Panel>
          </Stack>
        </Screen>
      </UIProvider>,
    );
    expect(screen.getByTestId("s")).toHaveStyle({ backgroundColor: themes.dark.color.background });
    expect(screen.getByTestId("p")).toHaveStyle({ backgroundColor: themes.dark.color.surface });
  });
});
