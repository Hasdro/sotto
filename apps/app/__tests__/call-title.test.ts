/** UX-009: a call is listed under a name, not "Call 11/14/2026, 9:46:45 AM" (US 12-hour) above a
 * "14 Nov 2026 09:46" (24-hour) line. */
import { callTitle, dayPart, isAutoTitle } from "../features/history/title";
import { type StringKey, t } from "../lib/i18n";

const en = (key: StringKey) => t(key, "en");
const ar = (key: StringKey) => t(key, "ar");

describe("call names (UX-009)", () => {
  it.each([
    "Call 11/14/2026, 9:46:45 AM",
    "Call 27/11/2026, 09:46:45",
    "Call ٢٧‏/١١‏/٢٠٢٦، ٩:٤٦:٤٥ ص",
    "",
    "   ",
  ])("treats the old timestamp title %p as unnamed", (title) => {
    expect(isAutoTitle(title)).toBe(true);
  });

  it.each(["Desmond Lee", "Call back Sudesh", "Zoho quote walkthrough", "Spoken call"])(
    "keeps a real name %p",
    (title) => {
      expect(isAutoTitle(title)).toBe(false);
    },
  );

  it("knows the part of the day on the Dubai clock, like every time in the app", () => {
    expect(dayPart("2026-11-14T05:46:45Z")).toBe("morning"); // 09:46
    expect(dayPart("2026-11-14T08:00:00Z")).toBe("afternoon"); // 12:00
    expect(dayPart("2026-11-14T13:00:00Z")).toBe("evening"); // 17:00
    expect(dayPart("2026-11-14T18:00:00Z")).toBe("night"); // 22:00
    expect(dayPart(Date.parse("2026-11-14T00:59:00Z"))).toBe("night"); // 04:59
    expect(dayPart(Date.parse("2026-11-14T01:00:00Z"))).toBe("morning"); // 05:00
  });

  it("shows the saved name, else the part of the day, in English and Arabic", () => {
    expect(callTitle("Desmond Lee", "2026-11-14T05:46:45Z", en)).toBe("Desmond Lee");
    expect(callTitle("  Desmond Lee ", "2026-11-14T05:46:45Z", en)).toBe("Desmond Lee");
    expect(callTitle("Call 11/14/2026, 9:46:45 AM", "2026-11-14T05:46:45Z", en)).toBe(
      "Morning call",
    );
    expect(callTitle("", Date.parse("2026-11-14T15:30:00Z"), en)).toBe("Evening call");
    expect(callTitle("", Date.parse("2026-11-14T15:30:00Z"), ar)).toBe("مكالمة مسائية");
    expect(callTitle(undefined, "2026-11-14T10:00:00Z", ar)).toBe("مكالمة بعد الظهر");
  });
});
