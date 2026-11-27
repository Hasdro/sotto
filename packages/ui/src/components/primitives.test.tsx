/** W1-UI (T-072): the shared primitives waves 2–3 build on. Render, keyboard and RTL per primitive. */
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { StyleSheet } from "react-native";
import { type Direction, UIProvider } from "../theme.tsx";
import { layout, minTouchTarget, size, type ThemeName, themes } from "../tokens.ts";
import { Button } from "./Button.tsx";
import { ChecklistRow } from "./ChecklistRow.tsx";
import { Disclosure } from "./Disclosure.tsx";
import { IconButton } from "./IconButton.tsx";
import { LRI, LtrRun, PDI } from "./LtrRun.tsx";
import { Sheet } from "./Sheet.tsx";
import { StatTile } from "./StatTile.tsx";
import { Text } from "./Text.tsx";
import { Toast } from "./Toast.tsx";

const ui = (el: ReactElement, opts: { scheme?: ThemeName; direction?: Direction } = {}) =>
  render(
    <UIProvider scheme={opts.scheme ?? "light"} direction={opts.direction ?? "ltr"}>
      {el}
    </UIProvider>,
  );

const key = (k: string) => ({ nativeEvent: { key: k }, key: k, preventDefault: () => {} });

describe("IconButton (UX-44a)", () => {
  it("has an accessible name, a 44 pt target and fires onPress", async () => {
    const onPress = jest.fn();
    await ui(<IconButton icon="close" label="Close" onPress={onPress} testID="ib" />);
    const b = screen.getByRole("button", { name: "Close" });
    const s = StyleSheet.flatten(b.props.style);
    expect(s.minWidth).toBeGreaterThanOrEqual(minTouchTarget);
    expect(s.minHeight).toBeGreaterThanOrEqual(minTouchTarget);
    await fireEvent.press(b);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("shows a visible focus ring in the focus token while focused", async () => {
    await ui(<IconButton icon="check" label="Helpful" onPress={() => {}} testID="ib" />);
    expect(StyleSheet.flatten(screen.getByTestId("ib").props.style).outlineWidth ?? 0).toBe(0);
    await fireEvent(screen.getByTestId("ib"), "focus");
    expect(screen.getByTestId("ib")).toHaveStyle({
      outlineColor: themes.light.color.focus,
      outlineWidth: size.focusRing,
    });
    await fireEvent(screen.getByTestId("ib"), "blur");
    expect(StyleSheet.flatten(screen.getByTestId("ib").props.style).outlineWidth ?? 0).toBe(0);
  });

  it("reports a selected (pressed) state", async () => {
    await ui(<IconButton icon="check" label="Helpful" selected onPress={() => {}} />);
    expect(screen.getByRole("button", { name: "Helpful" })).toBeSelected();
  });
});

describe("Button helper text (UX-44a)", () => {
  it("explains a disabled state under the button and to screen readers", async () => {
    await ui(<Button label="Save client" disabled helper="Enter a client ID first" testID="b" />);
    expect(screen.getByText("Enter a client ID first")).toBeOnTheScreen();
    expect(screen.getByTestId("b")).toHaveProp("accessibilityHint", "Enter a client ID first");
  });

  it("shows no helper when enabled", async () => {
    await ui(<Button label="Save client" helper="Enter a client ID first" />);
    expect(screen.queryByText("Enter a client ID first")).toBeNull();
  });

  it("has a focus ring", async () => {
    await ui(<Button label="Go" testID="b" />);
    await fireEvent(screen.getByTestId("b"), "focus");
    expect(screen.getByTestId("b")).toHaveStyle({ outlineColor: themes.light.color.focus });
  });
});

describe("Disclosure", () => {
  it("renders closed, opens on press, and reports expanded", async () => {
    await ui(
      <Disclosure title="Details" testID="d">
        <Text>Inside</Text>
      </Disclosure>,
    );
    const head = screen.getByRole("button", { name: "Details" });
    expect(head).not.toBeExpanded();
    expect(screen.queryByText("Inside")).toBeNull();
    await fireEvent.press(head);
    expect(head).toBeExpanded();
    expect(screen.getByText("Inside")).toBeOnTheScreen();
  });

  it("keyboard: Enter and Space toggle (web keydown), Escape closes", async () => {
    await ui(
      <Disclosure title="Details" testID="d">
        <Text>Inside</Text>
      </Disclosure>,
    );
    const head = screen.getByTestId("d-toggle");
    await fireEvent(head, "keyDown", key("Enter"));
    expect(screen.getByText("Inside")).toBeOnTheScreen();
    await fireEvent(head, "keyDown", key("Escape"));
    expect(screen.queryByText("Inside")).toBeNull();
    await fireEvent(head, "keyDown", key(" "));
    expect(screen.getByText("Inside")).toBeOnTheScreen();
  });

  it("controlled: follows `open` and calls onToggle", async () => {
    const onToggle = jest.fn();
    await ui(
      <Disclosure title="Details" open onToggle={onToggle}>
        <Text>Inside</Text>
      </Disclosure>,
    );
    expect(screen.getByText("Inside")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Details" }));
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(screen.getByText("Inside")).toBeOnTheScreen();
  });

  it("RTL: the chevron points the other way", async () => {
    await ui(<Disclosure title="تفاصيل" testID="d" />, { direction: "rtl" });
    const rtl = StyleSheet.flatten(screen.getByTestId("d-chevron").props.style);
    await ui(<Disclosure title="Details" testID="e" />);
    const ltr = StyleSheet.flatten(screen.getByTestId("e-chevron").props.style);
    expect(rtl.transform).not.toEqual(ltr.transform);
  });
});

describe("Sheet", () => {
  const sheet = (onClose = jest.fn(), width?: number) => (
    <Sheet open title="Edit note" onClose={onClose} closeLabel="Close" testID="s" width={width}>
      <Text>Body</Text>
    </Sheet>
  );

  it("renders a titled dialog with its body and a close button", async () => {
    await ui(sheet());
    expect(screen.getByText("Edit note")).toBeOnTheScreen();
    expect(screen.getByText("Body")).toBeOnTheScreen();
    expect(screen.getByTestId("s-panel")).toHaveProp("accessibilityViewIsModal", true);
  });

  it("renders nothing when closed", async () => {
    await ui(
      <Sheet open={false} title="T" onClose={() => {}} closeLabel="Close" testID="s">
        <Text>Body</Text>
      </Sheet>,
    );
    expect(screen.queryByText("Body")).toBeNull();
  });

  it("Escape (onRequestClose), the close button and the scrim close it", async () => {
    const onClose = jest.fn();
    await ui(sheet(onClose));
    await fireEvent(screen.getByTestId("s"), "requestClose");
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await fireEvent.press(screen.getByTestId("s-scrim", { includeHiddenElements: true }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("is a bottom sheet below 768 px and a centred dialog from 768 px", async () => {
    await ui(sheet(undefined, layout.sheetBreakpoint - 1));
    expect(screen.getByTestId("s-panel")).toHaveStyle({ position: "absolute", bottom: 0 });
    await ui(sheet(undefined, layout.sheetBreakpoint));
    expect(screen.getByTestId("s-panel")).toHaveStyle({ maxWidth: layout.sheetMaxWidth });
    expect(StyleSheet.flatten(screen.getByTestId("s-panel").props.style).bottom).toBeUndefined();
  });

  it("RTL: lays out in the given direction", async () => {
    await ui(sheet(), { direction: "rtl" });
    expect(screen.getByTestId("s-root")).toHaveStyle({ direction: "rtl" });
  });
});

describe("ChecklistRow", () => {
  it("is a checkbox with a one-line summary that toggles", async () => {
    const onToggle = jest.fn();
    await ui(
      <ChecklistRow checked={false} label="Log the call in Zoho" onToggle={onToggle} testID="r" />,
    );
    const box = screen.getByRole("checkbox", { name: "Log the call in Zoho" });
    expect(box).not.toBeChecked();
    expect(screen.getByText("Log the call in Zoho")).toHaveProp("numberOfLines", 1);
    await fireEvent.press(box);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("keyboard: Space toggles (web keydown)", async () => {
    const onToggle = jest.fn();
    await ui(<ChecklistRow checked label="Send email" onToggle={onToggle} testID="r" />);
    await fireEvent(screen.getByTestId("r-check"), "keyDown", key(" "));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("an Edit disclosure reveals the slot", async () => {
    await ui(
      <ChecklistRow checked label="Send email" onToggle={() => {}} editLabel="Edit" testID="r">
        <Text>Editor</Text>
      </ChecklistRow>,
    );
    expect(screen.queryByText("Editor")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText("Editor")).toBeOnTheScreen();
  });

  it("RTL: renders inside an RTL provider with the row mirrored by direction", async () => {
    await ui(<ChecklistRow checked label="أرسل البريد" onToggle={() => {}} testID="r" />, {
      direction: "rtl",
    });
    expect(screen.getByRole("checkbox", { name: "أرسل البريد" })).toBeChecked();
    expect(screen.getByTestId("r")).toHaveStyle({ flexDirection: "row" });
  });
});

describe("Toast", () => {
  it("dark theme: the raised surface with a border, not inverted (UX-40)", async () => {
    await ui(<Toast title="Sent to your manager" testID="t" />, { scheme: "dark" });
    expect(screen.getByTestId("t")).toHaveStyle({
      backgroundColor: themes.dark.color.surfaceRaised,
      borderColor: themes.dark.color.toastBorder,
    });
    expect(screen.getByText("Sent to your manager")).toHaveStyle({
      color: themes.dark.color.onToast,
    });
  });

  it("light theme stays inverted", async () => {
    await ui(<Toast title="Saved" testID="t" />);
    expect(screen.getByTestId("t")).toHaveStyle({ backgroundColor: themes.light.color.toastFill });
  });

  it("action slot: an Undo button that fires, and the toast stays a polite alert", async () => {
    const onPress = jest.fn();
    await ui(<Toast title="Note deleted" action={{ label: "Undo", onPress }} testID="t" />);
    expect(screen.getByTestId("t")).toHaveProp("accessibilityLiveRegion", "polite");
    await fireEvent.press(screen.getByRole("button", { name: "Undo" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("action keyboard: Enter on the action fires it (web keydown)", async () => {
    const onPress = jest.fn();
    await ui(<Toast title="Note deleted" action={{ label: "Undo", onPress }} testID="t" />);
    await fireEvent(screen.getByTestId("t-action"), "keyDown", key("Enter"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("RTL: renders the action in an RTL provider", async () => {
    await ui(<Toast title="حُذفت" action={{ label: "تراجع", onPress: () => {} }} testID="t" />, {
      direction: "rtl",
    });
    expect(screen.getByRole("button", { name: "تراجع" })).toBeOnTheScreen();
  });
});

describe("StatTile", () => {
  it("renders a neutral label and value, read as one", async () => {
    await ui(
      <StatTile label="Calls this week" value="12" hint="3 more than last week" testID="st" />,
    );
    expect(screen.getByTestId("st")).toHaveProp(
      "accessibilityLabel",
      "Calls this week: 12. 3 more than last week",
    );
    expect(screen.getByTestId("st")).toHaveStyle({
      backgroundColor: themes.light.color.surface,
      borderColor: themes.light.color.border,
    });
  });

  it("RTL: renders in an RTL provider", async () => {
    await ui(<StatTile label="المكالمات" value="١٢" testID="st" />, { direction: "rtl" });
    expect(screen.getByText("١٢")).toBeOnTheScreen();
  });

  it("is not focusable (no keyboard stop)", async () => {
    await ui(<StatTile label="Calls" value="12" testID="st" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("takes a layout override from its row, keeping its own look (UI-003)", async () => {
    await ui(<StatTile label="Calls" value="12" testID="st" style={{ flexBasis: "40%" }} />);
    expect(screen.getByTestId("st")).toHaveStyle({ flexBasis: "40%", borderWidth: 1 });
  });
});

describe("LtrRun", () => {
  it("wraps a Latin run in Unicode isolates with LTR writing direction", async () => {
    await ui(
      <Text>
        {"ملاحظة على "}
        <LtrRun testID="run">Acme renewal 2027</LtrRun>
      </Text>,
      { direction: "rtl" },
    );
    const run = screen.getByTestId("run");
    expect(run).toHaveStyle({ writingDirection: "ltr" });
    expect(run.props.children).toEqual([LRI, "Acme renewal 2027", PDI]);
  });

  it("is plain text in LTR too (no visible marks)", async () => {
    await ui(<LtrRun testID="run">Jane Doe</LtrRun>);
    expect(screen.getByText("Jane Doe", { exact: false })).toBeOnTheScreen();
  });
});

describe("keyboard focus ring under act", () => {
  it("Disclosure header shows the ring on focus", async () => {
    await ui(<Disclosure title="Details" testID="d" />);
    await act(async () => {
      fireEvent(screen.getByTestId("d-toggle"), "focus");
    });
    expect(screen.getByTestId("d-toggle")).toHaveStyle({ outlineColor: themes.light.color.focus });
  });
});
