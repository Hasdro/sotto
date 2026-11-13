/** UX-27, INT-07: the review leads with the tip and the mascot's mood, bands the chance to close,
 * labels risk signals AI-estimated, and keeps the scores under Details. */
import type { CallReview } from "@sotto/engine";
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { saveDeviceCall, setDeviceReview } from "../../lib/deviceHistory";
import type { Locale } from "../../lib/i18n";
import { LocaleProvider } from "../../lib/locale";
import { CallReviewPanel } from "./CallReviewPanel";

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
