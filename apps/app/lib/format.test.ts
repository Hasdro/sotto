/** UX-17: every Zoho value in the rail is formatted, in English and Arabic, Western digits. */
import {
  formatDay,
  formatMoney,
  formatNumber,
  formatSeconds,
  formatWhen,
  parseAmount,
} from "./format";

// 13 Nov 2026, 10:00 in Dubai.
const NOW = new Date("2026-11-13T06:00:00Z");

describe("formatSeconds (UI-017)", () => {
  it("says the unit in the reader's language, Western digits", () => {
    expect(formatSeconds(1140, "en")).toBe("1.1 s");
    expect(formatSeconds(1140, "ar")).toBe("1.1 ث");
    expect(formatSeconds(1500, "ar")).not.toMatch(/[٠-٩]|\bs\b/);
  });
});

describe("format (UX-17)", () => {
  it("groups digits", () => {
    expect(formatNumber(12000, "en")).toBe("12,000");
    expect(formatNumber(1234567.5, "en")).toBe("1,234,567.5");
    expect(formatNumber(12000, "ar")).toMatch(/12[,٬]000/);
    expect(formatNumber(12000, "ar")).not.toMatch(/[٠-٩]/);
  });

  it("reads Zoho amounts, which arrive as text", () => {
    expect(parseAmount("12000")).toBe(12000);
    expect(parseAmount("12,000.50")).toBe(12000.5);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("n/a")).toBeNull();
  });

  it("formats money with the currency when it is known, grouped digits otherwise", () => {
    expect(formatMoney("12000", "AED", "en")).toBe("AED 12,000");
    expect(formatMoney("12000", null, "en")).toBe("12,000");
    expect(formatMoney("", "AED", "en")).toBe("");
    expect(formatMoney("not a number", "AED", "en")).toBe("not a number");
    const ar = formatMoney("12000", "AED", "ar");
    expect(ar).toMatch(/12[,٬]000/);
    expect(ar).not.toMatch(/[٠-٩]/);
    expect(ar).not.toBe("12,000"); // the currency is there
  });

  it("names today and tomorrow, otherwise a short date (year only when not this year)", () => {
    expect(formatDay("2026-11-13", "en", NOW)).toBe("Today");
    expect(formatDay("2026-11-14", "en", NOW)).toBe("Tomorrow");
    expect(formatDay("2026-12-01", "en", NOW)).toBe("1 Dec");
    expect(formatDay("2027-01-05", "en", NOW)).toBe("5 Jan 2027");
    expect(formatDay("2026-11-13", "ar", NOW)).toBe("اليوم");
    expect(formatDay("2026-11-14", "ar", NOW)).toBe("غداً");
    expect(formatDay("2026-12-01", "ar", NOW)).not.toMatch(/[٠-٩]/);
    expect(formatDay("garbage", "en", NOW)).toBe("garbage");
  });

  it("a date-only Zoho value is a calendar day, never shifted by the time zone", () => {
    expect(formatDay("2026-12-01", "en", NOW)).toBe("1 Dec");
    expect(formatDay("2026-12-01T00:00:00+04:00", "en", NOW)).toBe("1 Dec");
  });

  it("formats a time with its day", () => {
    expect(formatWhen("2026-11-13T09:53:00Z", "en", NOW)).toBe("Today, 13:53");
    expect(formatWhen("2026-12-01T09:53:00Z", "en", NOW)).toBe("1 Dec, 13:53");
    expect(formatWhen("2026-11-13T09:53:00Z", "ar", NOW)).toBe("اليوم، 01:53 م");
    expect(formatWhen("nope", "en", NOW)).toBe("nope");
  });
});
