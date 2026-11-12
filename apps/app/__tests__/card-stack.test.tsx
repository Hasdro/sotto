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
