/** The History hover card (owner, 22 Oct): the facts that do not fit on the row. */

import { UIProvider } from "@sotto/ui";
import { render, screen } from "@testing-library/react-native";
import { CallPeek } from "../components/CallPeek";
import type { PastCall } from "../features/history/mock";
import { LocaleProvider } from "../lib/locale";

const call: PastCall = {
  id: "c-peek",
  customer: "Sara Nasser",
  company: "Palm Homes",
  startedAt: "2026-10-22T09:58:03+04:00",
  minutes: 4,
  outcome: "meeting",
  transcript: [],
  cards: [{ type: "answer", source: "playbook", text: "The handover is Q1 next year.", atMs: 0 }],
  source: "zoom",
  success: 72,
  notes: "Call back Sunday",
};

describe("CallPeek", () => {
  it("shows the company, the source, the chance to close, a card and the note", async () => {
    await render(
      <LocaleProvider>
        <UIProvider direction="ltr">
          <CallPeek call={call} />
        </UIProvider>
      </LocaleProvider>,
    );
    const find = (text: string | RegExp) => screen.getByText(text, { includeHiddenElements: true });
    expect(find("Palm Homes")).toBeOnTheScreen();
    expect(find("Zoom")).toBeOnTheScreen();
    expect(find("72% to close")).toBeOnTheScreen();
    expect(find("The handover is Q1 next year.")).toBeOnTheScreen();
    expect(find(/Call back Sunday/)).toBeOnTheScreen();
  });

  it("is visual only: the row already says all of it to a screen reader", async () => {
    await render(
      <LocaleProvider>
        <UIProvider direction="ltr">
          <CallPeek call={call} />
        </UIProvider>
      </LocaleProvider>,
    );
    expect(screen.queryByText("Palm Homes")).toBeNull();
  });
});
