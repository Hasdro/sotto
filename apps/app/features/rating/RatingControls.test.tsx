/** T-058: rating controls only on AI advice cards; reason chips after a choice; the server gets
 * no card text. */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { CardView } from "../cards/reducer";

const mockApi = jest.fn(async (..._args: unknown[]) => ({}));
let mockFeature = "available";
jest.mock("../../lib/cloud", () => ({
  cloudActive: () => true,
  cloudApi: (...args: unknown[]) => mockApi(...args),
}));
jest.mock("../../components/FeatureGate", () => ({
  useFeature: () => ({ state: mockFeature }),
}));

import { LocaleProvider } from "../../lib/locale";
import { RatingControls } from "./RatingControls";
import { ratingsFor, resetRatings } from "./ratings";

const card = (over: Partial<CardView> = {}): CardView => ({
  id: "card-1",
  callId: "call-1",
  type: "answer",
  source: "ai",
  label: null,
  text: "Secret card words.",
  done: true,
  turnKey: "t",
  firstSeenAt: 0,
  shownAfterMs: 500,
  timing: null,
  chunks: {},
  doneSeq: 1,
  ...over,
});

const show = (c: CardView) =>
  render(
    <LocaleProvider>
      <UIProvider direction="ltr">
        <RatingControls card={c} />
      </UIProvider>
    </LocaleProvider>,
  );

describe("RatingControls", () => {
  beforeEach(() => {
    resetRatings();
    mockApi.mockClear();
    mockFeature = "available";
  });

  it.each([
    ["playbook", "answer"],
    ["holding", "holding"],
    ["ai", "holding"],
  ] as const)("is not shown on %s %s cards", async (source, type) => {
    await show(card({ source, type }));
    expect(screen.queryByTestId("rating-card-1")).toBeNull();
  });

  it("is not shown while the card streams or when ratings are off", async () => {
    await show(card({ done: false }));
    expect(screen.queryByTestId("rating-card-1")).toBeNull();
    mockFeature = "off_by_org";
    await show(card());
    expect(screen.queryByTestId("rating-card-1")).toBeNull();
  });

  it("rates, offers reason chips, and sends no card words", async () => {
    await show(card({ source: "backup", type: "objection" }));
    await fireEvent.press(screen.getByTestId("rate-down-card-1"));
    expect(screen.getByTestId("reason-too_long-card-1")).toBeTruthy();
    expect(screen.queryByTestId("reason-good_phrasing-card-1")).toBeNull();
    await fireEvent.press(screen.getByTestId("reason-too_long-card-1"));
    expect(ratingsFor("call-1")).toEqual([
      expect.objectContaining({
        rating: "down",
        reasons: ["too_long"],
        text: "Secret card words.",
      }),
    ]);
    const last = mockApi.mock.calls.at(-1);
    expect(last?.[0]).toBe("/api/v1/ratings");
    expect(last?.[1]).toEqual({
      method: "POST",
      body: {
        call_id: "call-1",
        card_id: "card-1",
        card_type: "objection",
        card_source: "backup",
        rating: "down",
        reasons: ["too_long"],
      },
    });
    expect(JSON.stringify(mockApi.mock.calls)).not.toContain("Secret card words");
    // Pressing the same choice again clears it.
    await fireEvent.press(screen.getByTestId("rate-down-card-1"));
    expect(ratingsFor("call-1")).toEqual([]);
    expect(mockApi.mock.calls.at(-1)?.[1]).toMatchObject({ body: { rating: null, reasons: [] } });
  });
});
