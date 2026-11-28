/** FUNC-005: what admins and agents read carries no internal spec codes or team jargon, and the
 * practice call's stated length is the length of its script. */
import practiceSeed from "../../../seed/practice/practice.json";
import { CALL_TEXT } from "../features/call/strings";
import { FLAG_TEXT } from "../features/flags/strings";
import { SETUP_STEPS } from "../features/home/setup";
import { HOME_TEXT, type HomeTextKey } from "../features/home/strings";
import { LOCALES, type Locale, STRING_KEYS, t } from "../lib/i18n";

const INTERNAL = /\(R\d+[a-z]?\)|\bWHY insights\b|\(text [^)]*\)|\(النص [^)]*\)/;

/** The Setup guide's step texts are Home string keys; read them in both languages. */
const setupText = LOCALES.flatMap((l) =>
  SETUP_STEPS.flatMap((s) => [s.title, s.whatItDoes, s.recommendedDefault])
    .filter((k): k is HomeTextKey => Boolean(k))
    .map((k) => HOME_TEXT[l][k]),
);
const flagText = LOCALES.flatMap((l) => [
  ...Object.values(FLAG_TEXT[l].name),
  ...Object.values(FLAG_TEXT[l].about),
]);

describe("customer-facing copy (FUNC-005)", () => {
  it("names no requirement codes, internal terms or text versions", () => {
    const strings = LOCALES.flatMap((l) => STRING_KEYS.map((k) => t(k, l)));
    const hits = [...strings, ...setupText, ...flagText].filter((s) => INTERNAL.test(s));
    expect(hits).toEqual([]);
  });

  it("says how long the practice call really is, the same everywhere", () => {
    const lines: { gap_ms?: number; duration_ms?: number }[] = practiceSeed.lines;
    const ms = lines.reduce((n, l) => n + (l.gap_ms ?? 0) + (l.duration_ms ?? 0), 0);
    const seconds = Math.round(ms / 10_000) * 10; // "30-second", to the nearest 10 s
    const practice = SETUP_STEPS.find((s) => s.id === "practice")?.whatItDoes;
    const guideSays = (l: Locale) => (practice ? HOME_TEXT[l][practice] : "");
    expect(guideSays("en")).toContain(`${seconds}-second`);
    expect(guideSays("ar")).toContain(`${seconds} ثانية`);
    expect(CALL_TEXT.en["practice.body"]).toContain(`${seconds}-second`);
    expect(CALL_TEXT.ar["practice.body"]).toContain(`${seconds} ثانية`);
  });
});
