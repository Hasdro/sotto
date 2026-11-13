/** D-037 building blocks: glass only on floating chrome, nav rows, list rows, page header. */
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { StyleSheet } from "react-native";
import { UIProvider } from "../theme.tsx";
import { minTouchTarget, radius, type ThemeName, themes } from "../tokens.ts";
import { Button } from "./Button.tsx";
import { GlassSurface, ListRow, NavRow, PageHeader, Skeleton } from "./chrome.tsx";
import { SuggestionCard } from "./SuggestionCard.tsx";

const ui = (el: ReactElement, scheme: ThemeName = "light") =>
  render(<UIProvider scheme={scheme}>{el}</UIProvider>);

const strings = {
  type: "Answer",
  source: "From your playbook",
  notInPlaybook: "Not in playbook — check before promising",
  streaming: "still arriving",
};

describe("Quiet Paper Glass primitives (D-037)", () => {
  it("GlassSurface uses the opaque fallback on native, with the shape's radius", async () => {
    await ui(<GlassSurface testID="g" shape="composer" />, "dark");
    expect(screen.getByTestId("g")).toHaveStyle({
      backgroundColor: themes.dark.glass.fallback,
      borderRadius: radius.composer,
    });
  });

  it("buttons are pills; secondary is the flat neutral chip with no visible border", async () => {
    await ui(<Button label="Select" variant="secondary" testID="b" />);
    expect(screen.getByTestId("b")).toHaveStyle({
      borderRadius: radius.pill,
      backgroundColor: themes.light.color.surfaceSunken,
      borderColor: themes.light.color.surfaceSunken,
    });
  });

  it("the hero card is a bubble: accent fill, one tail corner, no voice bar", async () => {
    await ui(
      <SuggestionCard
        type="answer"
        source="playbook"
        text="Yes."
        done
        strings={strings}
        testID="c"
      />,
    );
    const s = StyleSheet.flatten(screen.getByTestId("c").props.style);
    expect(s.backgroundColor).toBe(themes.light.card.answer.heroFill);
    expect(s.backgroundColor).toBe(themes.light.color.primary);
    expect(s.borderRadius).toBe(radius.xl);
    expect(s.borderBottomStartRadius).toBe(radius.sm);
    expect(s.borderStartWidth ?? 0).toBe(0);
  });

  it("NavRow marks the current page for assistive tech and keeps a 44 pt target", async () => {
    const onPress = jest.fn();
    await ui(<NavRow label="Calls" icon="call" current onPress={onPress} testID="n" />);
    const row = screen.getByTestId("n");
    expect(row.props["aria-current"]).toBe("page");
    expect(row).toHaveStyle({ backgroundColor: themes.light.color.surfaceSunken });
    expect(StyleSheet.flatten(row.props.style).minHeight).toBeGreaterThanOrEqual(minTouchTarget);
    await fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("ListRow reads title and description as one button when pressable", async () => {
    await ui(
      <ListRow title="Acme" description="Follow up Friday" icon="users" onPress={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Acme. Follow up Friday" })).toBeTruthy();
  });

  it("PageHeader is a header with the 34 px title, or 24 px when compact", async () => {
    await ui(<PageHeader title="Calls" lead="Every call you took this week." />);
    expect(screen.getByRole("header", { name: "Calls" })).toHaveStyle({ fontSize: 34 });
    await ui(<PageHeader title="Calls" compact />);
    expect(screen.getByRole("header", { name: "Calls" })).toHaveStyle({ fontSize: 24 });
  });

  it("Skeleton is hidden from screen readers", async () => {
    await ui(<Skeleton reduceMotion />);
    expect(screen.queryAllByRole("progressbar")).toHaveLength(0);
  });
});
