/** Older cards are dimmed and light up on hover (owner, 22 Oct). */
import { UIProvider } from "@sotto/ui";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { CardStack, DIM_OPACITY } from "../features/call/components/CardStack";
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
    expect(screen.getByTestId("earlier-a-fade")).toHaveStyle({ opacity: DIM_OPACITY });
    await fireEvent(screen.getByTestId("earlier-a"), "hoverIn");
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(screen.getByTestId("earlier-a-fade")).toHaveStyle({ opacity: 1 });
    jest.useRealTimers();
  });
});
