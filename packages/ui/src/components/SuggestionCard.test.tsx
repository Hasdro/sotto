import { render, screen } from "@testing-library/react-native";
import { UIProvider } from "../theme.tsx";
import { themes } from "../tokens.ts";
import { noticeFor, SuggestionCard, type SuggestionCardStrings } from "./SuggestionCard.tsx";

const strings: SuggestionCardStrings = {
  type: "Answer",
  source: "From your playbook",
  notInPlaybook: "Not in playbook — check before promising",
  streaming: "still arriving",
};

describe("SuggestionCard", () => {
  it("renders the streamed text and a caret while the card is open", async () => {
    await render(
      <SuggestionCard
        type="answer"
        source="playbook"
        text="Ask what"
        done={false}
        strings={strings}
        testID="c"
      />,
    );
    expect(screen.getByText(/Ask what/)).toBeOnTheScreen();
    expect(screen.getByTestId("card-caret")).toBeOnTheScreen();
    expect(screen.getByTestId("c")).toHaveProp("aria-busy", true);
  });

  it("drops the caret when done", async () => {
    await render(
      <SuggestionCard type="answer" source="playbook" text="Done." done strings={strings} />,
    );
    expect(screen.queryByTestId("card-caret")).toBeNull();
  });

  it.each(["ai", "backup"] as const)("shows the R2 notice for source %s", async (source) => {
    await render(
      <SuggestionCard type="answer" source={source} text="x" done strings={strings} testID="c" />,
    );
    expect(screen.getByText("Not in playbook — check before promising")).toBeOnTheScreen();
  });

  it("shows no notice for playbook answers without a label", async () => {
    await render(
      <SuggestionCard type="answer" source="playbook" text="x" done strings={strings} testID="c" />,
    );
    expect(screen.queryByTestId("c-notice")).toBeNull();
  });

  it("prefers the worker's localised label over the built-in text", async () => {
    await render(
      <SuggestionCard
        type="answer"
        source="ai"
        label="ليس في الدليل"
        text="x"
        done
        strings={strings}
      />,
    );
    expect(screen.getByText("ليس في الدليل")).toBeOnTheScreen();
    expect(screen.queryByText(strings.notInPlaybook)).toBeNull();
  });

  it("uses the card type's fill colour", async () => {
    await render(
      <UIProvider scheme="dark">
        <SuggestionCard
          type="objection"
          source="playbook"
          text="x"
          done
          strings={strings}
          testID="c"
        />
      </UIProvider>,
    );
    expect(screen.getByTestId("c")).toHaveStyle({
      backgroundColor: themes.dark.card.objection.heroFill,
    });
  });

  it("draws the holding line with a dashed outline instead of the voice bar", async () => {
    await render(
      <SuggestionCard
        type="holding"
        source="holding"
        text="Let me confirm."
        done
        strings={strings}
        testID="c"
      />,
    );
    expect(screen.getByTestId("c")).toHaveStyle({ borderStyle: "dashed" });
  });

  it("gives screen readers one label with type, notice and text", async () => {
    await render(
      <SuggestionCard
        type="answer"
        source="ai"
        text="Offer a visit."
        done
        strings={strings}
        testID="c"
      />,
    );
    expect(screen.getByTestId("c")).toHaveProp(
      "accessibilityLabel",
      "Answer. Not in playbook — check before promising. Offer a visit.",
    );
  });

  it("compact variant truncates to two lines", async () => {
    await render(
      <SuggestionCard
        type="question"
        source="playbook"
        text="Long text"
        done
        variant="compact"
        strings={strings}
      />,
    );
    expect(screen.getByText("Long text")).toHaveProp("numberOfLines", 2);
  });
});

describe("SuggestionCard glyphs in RTL", () => {
  it.each([
    ["answer", "”"],
    ["question", "؟"],
    ["warning", "!"],
  ] as const)("%s uses %s in RTL", async (type, glyph) => {
    await render(
      <UIProvider direction="rtl">
        <SuggestionCard type={type} source="playbook" text="x" done strings={strings} />
      </UIProvider>,
    );
    expect(screen.getByText(glyph, { includeHiddenElements: true })).toBeOnTheScreen();
  });
});

describe("noticeFor", () => {
  it("returns null for playbook and holding sources without a label", () => {
    expect(noticeFor("playbook", null, "n")).toBeNull();
    expect(noticeFor("holding", undefined, "n")).toBeNull();
  });
  it("falls back to the built-in text for ai and backup", () => {
    expect(noticeFor("ai", null, "n")).toBe("n");
    expect(noticeFor("backup", "", "n")).toBe("n");
  });
});
