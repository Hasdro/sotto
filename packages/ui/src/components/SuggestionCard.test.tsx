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

  it("compact labelled (History): names the type and the source under the sentence (UX-010)", async () => {
    await render(
      <SuggestionCard
        type="answer"
        source="playbook"
        text="x"
        done
        variant="compact"
        labelled
        strings={strings}
        testID="c"
      />,
    );
    expect(screen.getByTestId("c-kind")).toHaveTextContent("Answer · From your playbook");
  });

  it("compact labelled AI card: the type and the R2 notice", async () => {
    await render(
      <SuggestionCard
        type="question"
        source="ai"
        text="x"
        done
        variant="compact"
        labelled
        strings={{ ...strings, type: "Ask next" }}
        testID="c"
      />,
    );
    expect(screen.getByTestId("c-kind")).toHaveTextContent(
      "Ask next · Not in playbook — check before promising",
    );
  });

  it("compact labelled holding line: the type alone", async () => {
    await render(
      <SuggestionCard
        type="holding"
        source="holding"
        text="x"
        done
        variant="compact"
        labelled
        strings={{ ...strings, type: "Holding line" }}
        testID="c"
      />,
    );
    expect(screen.getByTestId("c-kind")).toHaveTextContent(/^Holding line$/);
  });
});

describe("SuggestionCard reading order (UX-11, UX-12)", () => {
  const short = {
    ...strings,
    source: "AI answer",
    notInPlaybookShort: "Not in playbook — check first",
  };

  /** testIDs of the card's direct children, in render order. */
  const order = (id: string) =>
    (screen.getByTestId(id).children as { props?: { testID?: string } }[]).map(
      (c) => c.props?.testID,
    );

  it("hero header is the icon only: the type and source are not printed above the sentence", async () => {
    await render(
      <SuggestionCard
        type="answer"
        source="ai"
        text="Offer a visit."
        done
        strings={short}
        testID="c"
      />,
    );
    expect(screen.queryByText("Answer")).toBeNull();
    expect(screen.queryByText("AI answer")).toBeNull();
    // Still named for screen readers.
    expect(screen.getByTestId("c").props.accessibilityLabel).toMatch(/^Answer\. /);
  });

  it("AI source: the short R2 notice sits under the sentence", async () => {
    await render(
      <SuggestionCard
        type="answer"
        source="ai"
        text="Offer a visit."
        done
        strings={short}
        testID="c"
      />,
    );
    expect(screen.getByText("Not in playbook — check first")).toBeOnTheScreen();
    const kids = order("c");
    expect(kids.indexOf("c-notice")).toBeGreaterThan(kids.indexOf("c-text"));
  });

  it("playbook source: no notice; the source is one quiet line under the sentence", async () => {
    await render(
      <SuggestionCard type="answer" source="playbook" text="x" done strings={strings} testID="c" />,
    );
    expect(screen.queryByTestId("c-notice")).toBeNull();
    expect(screen.getByText("From your playbook")).toBeOnTheScreen();
    const kids = order("c");
    expect(kids.indexOf("c-source")).toBeGreaterThan(kids.indexOf("c-text"));
  });

  it("prints no timing line", async () => {
    await render(
      <SuggestionCard type="answer" source="playbook" text="x" done strings={strings} testID="c" />,
    );
    expect(screen.queryByText(/after the customer stopped/)).toBeNull();
    expect(order("c")).toEqual(["c-meta", "c-text", "c-source"]);
  });

  it("compact: background-tone fill so earlier cards recede (UX-13)", async () => {
    await render(
      <SuggestionCard
        type="answer"
        source="ai"
        text="x"
        done
        variant="compact"
        strings={short}
        testID="c"
      />,
    );
    expect(screen.getByTestId("c")).toHaveStyle({ backgroundColor: themes.light.color.background });
    expect(screen.getByText("Not in playbook — check first")).toBeOnTheScreen();
    expect(screen.queryByText("Answer")).toBeNull();
  });

  it("compact holding card keeps its dashed edge (UX-14)", async () => {
    await render(
      <SuggestionCard
        type="holding"
        source="holding"
        text="x"
        done
        variant="compact"
        strings={strings}
        testID="c"
      />,
    );
    expect(screen.getByTestId("c")).toHaveStyle({
      borderStyle: "dashed",
      borderColor: themes.light.card.holding.accent,
    });
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
