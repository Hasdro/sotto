/** UX-002: the Morning brief calls only today's meetings "today's" (Dubai days, lib/format.ts). */
import { briefLines } from "../features/coach/brief";
import { coachText } from "../features/coach/strings";

const fsi = (s: string) => `⁨${s}⁩`;
const friday = new Date("2026-11-27T05:00:00Z"); // 09:00 in Dubai
const content = (meetings: { title: string; start?: string }[]) => ({
  day: "2026-11-27",
  has_zoho_meetings: meetings.length > 0,
  meetings,
  tip: "Pause after the price.",
  pending_reviews_count: 0,
  summary_text: "Today's meetings (2): Desmond, Sudesh. Tip for today: Pause after the price.",
});

describe("Morning brief lines (UX-002)", () => {
  it("calls only today's meetings today's", () => {
    const today = { title: "Desmond", start: "2026-11-27T10:00:00Z" };
    const monday = { title: "Sudesh", start: "2026-11-30T07:00:00Z" };
    expect(briefLines(content([today, monday]), coachText("en"), "en", friday)).toEqual([
      `Today's meetings (1): ${fsi("Desmond")}.`,
      "Tip for today: Pause after the price.",
    ]);
  });

  it("with none today, says so and names the day of the next one", () => {
    const tuesday = { title: "Sudesh", start: "2026-12-01T07:00:00Z" };
    const monday = { title: "Desmond", start: "2026-11-30T07:00:00Z" };
    expect(briefLines(content([tuesday, monday]), coachText("en"), "en", friday)).toEqual([
      "No meetings today · Next: Mon 30 Nov",
      "Tip for today: Pause after the price.",
    ]);
  });

  it("speaks Arabic", () => {
    const monday = { title: "Desmond", start: "2026-11-30T07:00:00Z" };
    expect(briefLines(content([monday]), coachText("ar"), "ar", friday)).toEqual([
      "لا اجتماعات اليوم · التالي: الاثنين، 30 نوفمبر",
      "نصيحة اليوم: Pause after the price.",
    ]);
  });

  it("never guesses a day for a meeting without a time", () => {
    expect(briefLines(content([{ title: "Desmond" }]), coachText("en"), "en", friday)).toEqual([
      "Tip for today: Pause after the price.",
    ]);
  });

  it("shows the server's sentence for an older brief without its parts", () => {
    const old = { summary_text: "Tip for today: Ask early." } as Parameters<typeof briefLines>[0];
    expect(briefLines(old, coachText("en"), "en", friday)).toEqual(["Tip for today: Ask early."]);
  });
});
