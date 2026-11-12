import { describe, expect, it } from "vitest";
import { CARD_KINDS, contrastRatio, type Hex, type Theme, themes } from "./tokens.ts";

const keys = (o: object) => Object.keys(o).sort();
type ColorKey = keyof Theme["color"];

/** Every text-on-fill pair the UI renders (DESIGN.md §3). Text needs 4.5:1 (WCAG 1.4.3). */
const TEXT_PAIRS: [fg: ColorKey, bg: ColorKey][] = [
  ["text", "background"],
  ["textMuted", "background"],
  ["text", "surface"],
  ["textMuted", "surface"],
  ["text", "surfaceSunken"],
  ["textMuted", "surfaceSunken"],
  ["primary", "background"],
  ["primary", "surface"],
  ["onPrimary", "primary"],
  ["onDanger", "danger"],
  ["danger", "background"],
  ["danger", "surface"],
  ["positive", "surface"],
  ["negative", "surface"],
  ["positive", "background"],
  ["negative", "background"],
  ["onInverseSurface", "inverseSurface"],
  ["noticeText", "noticeFill"],
  ["signal", "background"],
  ["signal", "surface"],
  ["onSignalFill", "signalFill"],
];

/** Control outlines and the focus ring need 3:1 against what they sit on (WCAG 1.4.11). */
const NON_TEXT_PAIRS: [fg: ColorKey, bg: ColorKey][] = [
  ["borderStrong", "background"],
  ["borderStrong", "surface"],
  ["focus", "background"],
  ["focus", "surface"],
  ["noticeBorder", "noticeFill"],
];

describe("design tokens", () => {
  it("light and dark define the same colour tokens", () => {
    expect(keys(themes.dark.color)).toEqual(keys(themes.light.color));
    expect(keys(themes.dark.card)).toEqual(keys(themes.light.card));
    for (const kind of CARD_KINDS) {
      expect(keys(themes.dark.card[kind])).toEqual(keys(themes.light.card[kind]));
    }
  });

  it("defines a palette for every card type in the protocol", () => {
    expect(keys(themes.light.card)).toEqual([...CARD_KINDS].sort());
  });

  it("uses lowercase #rrggbb everywhere, so contrast maths is exact", () => {
    const all: Hex[] = [
      ...Object.values(themes.light.color),
      ...Object.values(themes.dark.color),
      ...CARD_KINDS.flatMap((k) => [
        ...Object.values(themes.light.card[k]),
        ...Object.values(themes.dark.card[k]),
      ]),
    ];
    for (const hex of all) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  describe.each(["light", "dark"] as const)("%s theme meets WCAG 2.2 AA", (name) => {
    const t = themes[name];

    it("body text on background ≥ 4.5:1", () => {
      expect(contrastRatio(t.color.text, t.color.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.color.textMuted, t.color.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.color.text, t.color.surface)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(TEXT_PAIRS)("text %s on %s ≥ 4.5:1", (fg, bg) => {
      expect(contrastRatio(t.color[fg], t.color[bg])).toBeGreaterThanOrEqual(4.5);
    });

    it.each(NON_TEXT_PAIRS)("control %s on %s ≥ 3:1", (fg, bg) => {
      expect(contrastRatio(t.color[fg], t.color[bg])).toBeGreaterThanOrEqual(3);
    });

    it.each(CARD_KINDS)("%s card text on its fill ≥ 4.5:1", (type) => {
      const card = t.card[type];
      expect(contrastRatio(card.text, card.fill)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(CARD_KINDS)("%s card meta line on its fill ≥ 4.5:1", (type) => {
      const card = t.card[type];
      expect(contrastRatio(card.muted, card.fill)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(CARD_KINDS)("%s card icon glyph (fill colour) on its accent disc ≥ 4.5:1", (type) => {
      const card = t.card[type];
      expect(contrastRatio(card.fill, card.accent)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(CARD_KINDS)("%s card accent on the page background ≥ 3:1 (compact cards)", (type) => {
      expect(contrastRatio(t.card[type].accent, t.color.background)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(t.card[type].accent, t.color.surface)).toBeGreaterThanOrEqual(3);
    });

    it.each(CARD_KINDS)("the R2 notice is readable inside a %s card", (type) => {
      // The notice keeps its own fill; its border must still separate it from the card fill.
      expect(contrastRatio(t.color.noticeText, t.color.noticeFill)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.color.noticeBorder, t.card[type].fill)).toBeGreaterThanOrEqual(3);
    });

    it.each(CARD_KINDS)("%s hero card: sentence and meta line on the hero fill ≥ 4.5:1", (type) => {
      const card = t.card[type];
      expect(contrastRatio(card.heroText, card.heroFill)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(card.heroMuted, card.heroFill)).toBeGreaterThanOrEqual(4.5);
      // The icon disc is heroText with the glyph in heroFill: the same pair.
    });

    it.each(CARD_KINDS)(
      "%s hero card stands apart from the page (≥ 3:1, or a pale holding card with its dashed accent outline)",
      (type) => {
        const card = t.card[type];
        if (type === "holding") {
          expect(contrastRatio(card.accent, card.heroFill)).toBeGreaterThanOrEqual(3);
          return;
        }
        expect(contrastRatio(card.heroFill, t.color.background)).toBeGreaterThanOrEqual(3);
      },
    );

    it.each(CARD_KINDS)("the R2 notice box is distinct inside a %s hero card", (type) => {
      const fill = t.card[type].heroFill;
      const edge = Math.max(
        contrastRatio(t.color.noticeFill, fill),
        contrastRatio(t.color.noticeBorder, fill),
      );
      expect(edge).toBeGreaterThanOrEqual(3);
    });
  });

  it("computes the known contrast of black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });
});
