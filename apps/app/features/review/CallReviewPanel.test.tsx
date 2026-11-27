/** UX-27, INT-07: the review leads with the tip and the mascot's mood, bands the chance to close,
 * labels risk signals AI-estimated, and keeps the scores under Details. */
import type { CallReview } from "@sotto/engine";
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { type DeviceEntry, saveDeviceCall, setDeviceReview } from "../../lib/deviceHistory";
import type { Locale } from "../../lib/i18n";
import { LocaleProvider } from "../../lib/locale";
import { prefs, setPrefs } from "../../lib/prefs";
import { CallReviewPanel } from "./CallReviewPanel";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (href: string) => mockPush(href) } }));

const wrap = (node: React.ReactNode, locale: Locale = "en") =>
  render(
    <LocaleProvider initial={locale}>
      <UIProvider direction={locale === "ar" ? "rtl" : "ltr"}>{node}</UIProvider>
    </LocaleProvider>,
  );

const review = (success: number, extra: Partial<CallReview> = {}): CallReview => ({
  scores: { opening: 7, discovery: 6, listening: 8, objections: 5, clarity: 7, next_step: 6 },
  success,
  sentiment: "neutral",
  summary: "Agreed a demo.",
  tip: "Ask about budget early.",
  strengths: ["warm opening"],
  improve: [],
  ...extra,
});

function withReview(id: string, r: CallReview | null) {
  saveDeviceCall({
    id,
    started_at: 1,
    ended_at: 2,
    title: "Jane",
    mode: "live",
    cards: 0,
    p50_ms: null,
    p95_ms: null,
    transcript: [
      { kind: "line", speaker: "customer", text: "We need it next month please", at_ms: 1 },
      { kind: "line", speaker: "agent", text: "Sure", at_ms: 2 },
    ],
  });
  setDeviceReview(id, r);
}

describe("CallReviewPanel", () => {
  it.each([
    [80, "excellent", "Likely to close"],
    [65, "good", "Likely to close"],
    [50, "mixed", "Unclear"],
    [30, "needs work", "Unlikely to close"],
  ])("score %i: mood %s, band %s, tip first", async (score, mood, band) => {
    withReview(`r${score}`, review(score));
    await wrap(<CallReviewPanel callId={`r${score}`} />);
    const line = screen.getByTestId("review-line");
    expect(line).toHaveTextContent(/Coach's tip.*Ask about budget early\./);
    expect(screen.getByLabelText(`Call result: ${mood}`)).toBeOnTheScreen();
    expect(screen.getByTestId("review-chance")).toHaveTextContent(band);
  });

  it("no review: the no-result mood", async () => {
    withReview("rnone", null);
    await wrap(<CallReviewPanel callId="rnone" />);
    expect(screen.getByLabelText("Call result: no review")).toBeOnTheScreen();
  });

  it("keeps scores and talk time under Details", async () => {
    withReview("rd", review(70));
    await wrap(<CallReviewPanel callId="rd" />);
    expect(screen.queryByTestId("review-success")).toBeNull();
    expect(screen.queryByText("Discovery")).toBeNull();
    await fireEvent.press(screen.getByTestId("review-details-toggle"));
    expect(screen.getByTestId("review-success")).toBeOnTheScreen();
    expect(screen.getByText("Discovery")).toBeOnTheScreen();
    expect(screen.getByTestId("talk-meter")).toBeOnTheScreen();
  });

  it("labels risk signals AI-estimated, with the reason and the customer's words", async () => {
    withReview(
      "rr",
      review(40, { risks: [{ reason: "No budget yet", quote: "we have not set a budget" }] }),
    );
    await wrap(<CallReviewPanel callId="rr" />);
    const risks = screen.getByTestId("review-risks");
    expect(risks).toHaveTextContent(/Deal-risk signals.*AI-estimated/);
    expect(risks).toHaveTextContent(/No budget yet · “we have not set a budget”/);
  });

  it("renders in Arabic", async () => {
    withReview("rar", review(70));
    await wrap(<CallReviewPanel callId="rar" />, "ar");
    expect(screen.getByTestId("review-chance")).toHaveTextContent("مرجّح الإتمام");
  });
});

/** FUNC-002: a call without a review says why, from what this computer kept, and never points
 * at "Admin → Keys & providers" (removed in Round 2, D-078; models are AGN's, D-059). */
describe("no review: the reason, not a removed page (FUNC-002)", () => {
  const heard: DeviceEntry[] = [
    { kind: "line", speaker: "customer", text: "We need it next month please", at_ms: 1 },
  ];
  function saved(id: string, transcript: DeviceEntry[], review?: CallReview | null) {
    saveDeviceCall({
      id,
      started_at: 1,
      ended_at: 2,
      title: "",
      mode: "live",
      cards: 0,
      p50_ms: null,
      p95_ms: null,
      transcript,
      ...(review === undefined ? {} : { review }),
    });
  }
  beforeEach(() => {
    mockPush.mockReset();
    setPrefs({ bugReportRequested: false });
  });

  it("the customer was not heard: nothing to score", async () => {
    saved("n-unheard", [{ kind: "line", speaker: "agent", text: "Hello?", at_ms: 1 }], null);
    await wrap(<CallReviewPanel callId="n-unheard" />);
    expect(screen.getByTestId("review-none-unheard")).toHaveTextContent(
      "No review: the customer was not heard on this call, so there was nothing to score.",
    );
    expect(screen.queryByTestId("review-none-report")).toBeNull();
  });

  it("the review failed: says so and offers to report it", async () => {
    saved("n-failed", heard, null);
    await wrap(<CallReviewPanel callId="n-failed" />);
    expect(screen.getByTestId("review-none-failed")).toHaveTextContent(
      /could not review this call\. New calls are reviewed as usual/,
    );
    await fireEvent.press(screen.getByTestId("review-none-report"));
    expect(prefs().bugReportRequested).toBe(true);
    expect(mockPush).toHaveBeenCalledWith("/settings");
  });

  it("no review ran: says it was not reviewed and when calls are", async () => {
    saved("n-notrun", heard);
    await wrap(<CallReviewPanel callId="n-notrun" />);
    expect(screen.getByTestId("review-none-notRun")).toHaveTextContent(
      /not reviewed\. Calls are reviewed right after they end while Call review is on\./,
    );
  });

  it.each(["en", "ar"] as const)("never names Keys & providers (%s)", async (locale) => {
    for (const [id, transcript, r] of [
      [`k-u-${locale}`, [], null],
      [`k-f-${locale}`, heard, null],
      [`k-n-${locale}`, heard, undefined],
    ] as const) {
      saved(id, [...transcript], r);
      const view = await wrap(<CallReviewPanel callId={id} />, locale);
      expect(screen.getByTestId("review-none")).not.toHaveTextContent(
        /Keys & providers|المفاتيح والمزوّد/,
      );
      await view.unmount();
    }
  });
});
