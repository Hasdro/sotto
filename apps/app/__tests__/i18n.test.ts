import { directionOf, formatNumber, LOCALES, STRING_KEYS, t } from "../lib/i18n";

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe("string table", () => {
  it("has the R2 label wording in English", () => {
    expect(t("card.notInPlaybook")).toBe("Not in playbook — check before promising");
  });

  it("fills placeholders and leaves unknown ones visible", () => {
    expect(t("history.cards", "en", { count: 3 })).toBe("Cards: 3");
    expect(t("inbox.askedBy", "en", { customer: "A" })).toBe("A, on a call with {agent}");
  });

  it("defines a non-empty string for every key in every locale", () => {
    expect(STRING_KEYS.length).toBeGreaterThan(100);
    for (const locale of LOCALES) {
      for (const key of STRING_KEYS) expect(t(key, locale).trim().length).toBeGreaterThan(0);
    }
  });

  it("uses the same placeholders in Arabic as in English", () => {
    for (const key of STRING_KEYS) {
      expect([key, placeholders(t(key, "ar"))]).toEqual([key, placeholders(t(key, "en"))]);
    }
  });

  it("Arabic is right-to-left, English left-to-right", () => {
    expect(directionOf("ar")).toBe("rtl");
    expect(directionOf("en")).toBe("ltr");
  });

  it("formats numbers with Western digits in both languages", () => {
    expect(formatNumber(0.8432, "en", 2)).toBe("0.84");
    expect(formatNumber(0.8432, "ar", 2)).toBe("0.84");
  });
});
