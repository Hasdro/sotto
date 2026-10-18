import { describe, expect, it } from "vitest";
import { contrastRatio, themes } from "./tokens.ts";

const keys = (o: object) => Object.keys(o).sort();

describe("design tokens", () => {
  it("light and dark define the same colour tokens", () => {
    expect(keys(themes.dark.color)).toEqual(keys(themes.light.color));
    expect(keys(themes.dark.card)).toEqual(keys(themes.light.card));
  });

  describe.each(["light", "dark"] as const)("%s theme meets WCAG 2.2 AA", (name) => {
    const t = themes[name];

    it("body text on background ≥ 4.5:1", () => {
      expect(contrastRatio(t.color.text, t.color.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.color.textMuted, t.color.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.color.text, t.color.surface)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(Object.keys(themes.light.card) as (keyof typeof t.card)[])(
      "%s card text on its fill ≥ 4.5:1",
      (type) => {
        const card = t.card[type];
        expect(contrastRatio(card.text, card.fill)).toBeGreaterThanOrEqual(4.5);
      },
    );
  });

  it("computes the known contrast of black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });
});
