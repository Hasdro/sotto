/** Older cards are dimmed and light up on hover (owner, 22 Oct). */
import { themes, UIProvider } from "@sotto/ui";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { CardStack } from "../features/call/components/CardStack";
import type { CardView } from "../features/cards/reducer";
import { LocaleProvider } from "../lib/locale";

const card = (id: string, text: string): CardView => ({
  id,
  callId: "c",
  type: "answer",
  source: "playbook",
  label: null,
  text,
  done: true,
  turnKey: id,
  firstSeenAt: 0,
  shownAfterMs: 600,
  timing: null,
  chunks: {},
  doneSeq: 1,
});

describe("earlier cards", () => {
  it("are dimmed until hovered", async () => {
    jest.useFakeTimers();
    await render(
      <LocaleProvider>
        <UIProvider direction="ltr">
          <CardStack cards={[card("b", "Newest."), card("a", "Older.")]} wide listening={false} />
        </UIProvider>
      </LocaleProvider>,
    );
    // Dimmed by colour (muted text token, AA contrast), not by opacity (T-050).
    expect(screen.getByText("Older.")).toHaveStyle({ color: themes.light.color.textMuted });
    await fireEvent(screen.getByTestId("earlier-a"), "hoverIn");
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(screen.getByText("Older.")).toHaveStyle({ color: themes.light.color.text });
    jest.useRealTimers();
  });
});

jest.mock("../components/FeatureGate", () => ({
  ...jest.requireActual("../components/FeatureGate"),
  useFeature: () => ({ state: "available" }),
}));

const ai = (id: string, text: string, over: Partial<CardView> = {}): CardView => ({
  ...card(id, text),
  source: "ai",
  ...over,
});

const stack = (cards: CardView[], listening = true) =>
  render(
    <LocaleProvider>
      <UIProvider direction="ltr">
        <CardStack cards={cards} wide listening={listening} />
      </UIProvider>
    </LocaleProvider>,
  );

describe("live hero (UX-02, UX-11, UX-12)", () => {
  it("has no rating control and no timing line during the live call", async () => {
    await stack([ai("h", "Hero.")]);
    expect(screen.queryByTestId("rating-h")).toBeNull();
    expect(screen.queryByText(/after the customer stopped/)).toBeNull();
  });

  it("an AI hero shows the short R2 line; the type is not printed", async () => {
    await stack([ai("h", "Hero.")]);
    expect(screen.getByText("Not in playbook — check first")).toBeOnTheScreen();
    expect(screen.queryByText("Answer")).toBeNull();
    expect(screen.queryByText("AI answer")).toBeNull();
  });

  it("shows a small live dot, not the mascot, beside the listening line (UX-43a)", async () => {
    await stack([]);
    expect(screen.getByTestId("live-dot", { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.queryByTestId(/^mascot/, { includeHiddenElements: true })).toBeNull();
  });
});

describe("earlier cards: rating on hover/focus (UX-02)", () => {
  it("a collapsed AI card exposes two named 44 pt buttons on focus, not before", async () => {
    await stack([ai("b", "Newest."), ai("a", "Older.")]);
    expect(screen.queryByTestId("rating-a")).toBeNull();
    await fireEvent(screen.getByTestId("earlier-a"), "focus");
    expect(screen.getByRole("button", { name: "Helpful" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Not helpful" })).toBeOnTheScreen();
  });

  it("after the call every AI card is rateable; playbook and holding cards never are (R11)", async () => {
    await stack(
      [
        ai("c", "Newest."),
        card("p", "From the playbook."),
        ai("h", "Hold on.", { type: "holding", source: "holding" }),
        ai("a", "Older."),
      ],
      false,
    );
    expect(screen.getByTestId("rating-c")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("show-earlier"));
    expect(screen.getByTestId("rating-a")).toBeOnTheScreen();
    expect(screen.queryByTestId("rating-p")).toBeNull();
    expect(screen.queryByTestId("rating-h")).toBeNull();
  });
});

describe("earlier list (UX-13, UX-14)", () => {
  it("shows 2 earlier cards and 'Show earlier (1)' for the rest", async () => {
    await stack([card("d", "D."), card("c", "C."), card("b", "B."), card("a", "A.")]);
    expect(screen.getByTestId("earlier-c")).toBeOnTheScreen();
    expect(screen.getByTestId("earlier-b")).toBeOnTheScreen();
    expect(screen.queryByTestId("earlier-a")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Show earlier (1)" }));
    expect(screen.getByTestId("earlier-a")).toBeOnTheScreen();
  });

  it("earlier cards use the background tone, not the white surface", async () => {
    await stack([card("b", "B."), card("a", "A.")]);
    expect(screen.getByTestId("earlier-a-card")).toHaveStyle({
      backgroundColor: themes.light.color.background,
    });
  });

  it("drops a holding card once a real card for the same turn exists", async () => {
    const holding = card("h", "Let me confirm.");
    holding.type = "holding";
    holding.source = "holding";
    holding.turnKey = "t1";
    const real = { ...card("r", "Real answer."), turnKey: "t1" };
    await stack([card("n", "Newest."), real, holding]);
    expect(screen.queryByTestId("earlier-h")).toBeNull();
    expect(screen.getByTestId("earlier-r")).toBeOnTheScreen();
  });

  it("keeps a holding card whose turn has no real card yet, with its dashed edge", async () => {
    const holding = {
      ...card("h", "Let me confirm."),
      type: "holding" as const,
      source: "holding" as const,
    };
    await stack([card("n", "Newest."), holding]);
    expect(screen.getByTestId("earlier-h-card")).toHaveStyle({ borderStyle: "dashed" });
  });
});

describe("hero slot (PROD-002 regression)", () => {
  it("holds exactly one hero card while new cards keep arriving", async () => {
    const ids = ["a", "b", "c", "d", "e"];
    const cardsUpTo = (n: number) =>
      ids
        .slice(0, n)
        .reverse()
        .map((id) => card(id, `Card ${id}.`));
    const tree = (n: number) => (
      <LocaleProvider>
        <UIProvider direction="ltr">
          <CardStack cards={cardsUpTo(n)} wide listening />
        </UIProvider>
      </LocaleProvider>
    );
    const view = await render(tree(1));
    for (let n = 2; n <= ids.length; n++) await view.rerender(tree(n));
    expect(screen.getAllByTestId("hero-card")).toHaveLength(1);
    expect(screen.getByTestId("hero-card")).toHaveTextContent(/Card e\./);
  });
});
