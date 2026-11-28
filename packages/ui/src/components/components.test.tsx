import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { UIProvider } from "../theme.tsx";
import { minTouchTarget, themes } from "../tokens.ts";
import { Badge } from "./Badge.tsx";
import { Button } from "./Button.tsx";
import { Dropdown } from "./Dropdown.tsx";
import { EmptyState } from "./EmptyState.tsx";
import { ICON_NAMES, Icon } from "./Icon.tsx";
import { Panel, Screen, Stack } from "./layout.tsx";
import { Mascot, type MascotMood, moodFor } from "./Mascot.tsx";
import { SegmentedControl } from "./SegmentedControl.tsx";
import { Spinner } from "./Spinner.tsx";
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
    expect(screen.getByTestId("b")).toBeDisabled();
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

  it("busy shows a spinner, ignores presses and says it is busy, without the disabled dimming (UX-004)", async () => {
    const onPress = jest.fn();
    await render(<Button label="Opening…" onPress={onPress} busy testID="b" />);
    await fireEvent.press(screen.getByTestId("b"));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByTestId("b")).toBeBusy();
    // Decorative: the button itself is announced as busy.
    expect(screen.getByTestId("b-spinner", { includeHiddenElements: true })).toBeOnTheScreen();
    expect(StyleSheet.flatten(screen.getByTestId("b").props.style).opacity).toBeUndefined();
  });

  it("outline stays a visible button on a sunken panel: surface fill, strong edge (UI-006)", async () => {
    await render(<Button label="Test audio" variant="outline" testID="b" />);
    expect(screen.getByTestId("b")).toHaveStyle({
      backgroundColor: themes.light.color.surface,
      borderColor: themes.light.color.borderStrong,
    });
  });

  it("dangerGhost is a quiet red text button for a destructive first step (UI-012)", async () => {
    await render(<Button label="Remove" variant="dangerGhost" testID="b" />);
    expect(screen.getByTestId("b")).toHaveStyle({ backgroundColor: "transparent" });
    expect(screen.getByText("Remove")).toHaveStyle({ color: themes.light.color.danger });
  });
});

describe("Spinner", () => {
  it("is decorative and uses the muted text colour unless told otherwise", async () => {
    await render(<Spinner testID="s" />);
    const s = screen.getByTestId("s", { includeHiddenElements: true });
    expect(s.props.color).toBe(themes.light.color.textMuted);
    expect(s).not.toBeVisible();
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

  it("colours the agent and the customer differently (owner, 22 Oct)", async () => {
    await render(<TranscriptLine speaker="agent" speakerLabel="You" text="Sure." />);
    expect(screen.getByText("Sure.")).toHaveStyle({ color: themes.light.speaker.agent.text });
    await render(<TranscriptLine speaker="customer" speakerLabel="Customer" text="Is it?" />);
    expect(screen.getByText("Is it?")).toHaveStyle({ color: themes.light.speaker.customer.text });
    expect(themes.light.speaker.agent.fill).not.toBe(themes.light.speaker.customer.fill);
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
    expect(screen.getByTestId("s-customer")).toBeChecked();
    await fireEvent.press(screen.getByTestId("s-agent"));
    expect(onChange).toHaveBeenCalledWith("agent");
  });

  it("can be disabled: options stay readable but do nothing", async () => {
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
        disabled
        testID="s"
      />,
    );
    expect(screen.getByTestId("s-agent")).toBeDisabled();
    expect(screen.getByTestId("s-customer")).toBeChecked();
    await fireEvent.press(screen.getByTestId("s-agent"));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("Button trailing visual", () => {
  it("draws a trailing visual after the label, hidden from screen readers (UI-014)", async () => {
    await render(
      <Button label="Get apps" onPress={jest.fn()} trailing={<Icon name="external" size={16} />} />,
    );
    expect(screen.getByRole("button", { name: "Get apps" })).toBeOnTheScreen();
    expect(screen.getByTestId("icon-external", { includeHiddenElements: true })).toBeTruthy();
  });
});

describe("Dropdown", () => {
  const options = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ value: `v${i}`, label: `Option ${i}` }));

  it("lists a short list without a search box (UI-016)", async () => {
    await render(
      <Dropdown
        options={options(8)}
        value="v0"
        onChange={jest.fn()}
        accessibilityLabel="Pick"
        testID="d"
      />,
    );
    await fireEvent.press(screen.getByTestId("d-trigger"));
    expect(screen.getByTestId("d-v7")).toBeOnTheScreen();
    expect(screen.queryByTestId("d-search")).toBeNull();
  });

  it("searches a long list", async () => {
    const onChange = jest.fn();
    await render(
      <Dropdown
        options={options(9)}
        value="v0"
        onChange={onChange}
        accessibilityLabel="Pick"
        testID="d"
      />,
    );
    await fireEvent.press(screen.getByTestId("d-trigger"));
    await fireEvent.changeText(screen.getByTestId("d-search"), "8");
    expect(screen.queryByTestId("d-v1")).toBeNull();
    await fireEvent.press(screen.getByTestId("d-v8"));
    expect(onChange).toHaveBeenCalledWith("v8");
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

describe("Icon", () => {
  it("has a drawing for every name in the set", async () => {
    await render(
      <UIProvider>
        {ICON_NAMES.map((name) => (
          <Icon key={name} name={name} label={name} />
        ))}
      </UIProvider>,
    );
    expect(ICON_NAMES.length).toBeGreaterThanOrEqual(30);
    for (const name of ICON_NAMES) expect(screen.getByLabelText(name)).toBeOnTheScreen();
  });

  it("is hidden from assistive tech beside a label and named when alone", async () => {
    await render(
      <UIProvider>
        <Icon name="call" />
        <Icon name="mail" label="Email" />
      </UIProvider>,
    );
    expect(screen.queryByTestId("icon-call", { includeHiddenElements: true })).toHaveProp(
      "importantForAccessibility",
      "no-hide-descendants",
    );
    expect(screen.getByLabelText("Email")).toBeOnTheScreen();
  });
});

describe("Mascot moods (T-051)", () => {
  it.each([
    [80, "excellent"],
    [75, "excellent"],
    [74, "good"],
    [65, "good"],
    [60, "good"],
    [59, "mixed"],
    [50, "mixed"],
    [40, "mixed"],
    [39, "needsWork"],
    [30, "needsWork"],
    [null, "noResult"],
    [undefined, "noResult"],
  ])("moodFor(%s) is %s", (score, mood) => {
    expect(moodFor(score)).toBe(mood);
  });
  it.each(["excellent", "good", "mixed", "needsWork", "noResult"] as MascotMood[])(
    "renders %s",
    async (mood) => {
      await render(
        <UIProvider>
          <Mascot mood={mood} sentiment="negative" label={`r-${mood}`} />
        </UIProvider>,
      );
      expect(screen.getByTestId(`mascot-mood-${mood}`)).toBeTruthy();
      expect(screen.getByLabelText(`r-${mood}`)).toBeTruthy();
    },
  );
});
