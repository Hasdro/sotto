/**
 * `sourceName` (T-091): the call header's SourceChip showed "Practice" in English on Arabic
 * calls. Word names translate; brand names stay Latin in both languages.
 */
import { sourceName, type CallSource } from "./callSource";

describe("sourceName", () => {
  it.each([
    ["practice", "تدريب"],
    ["mic", "الميكروفون"],
    ["computer", "صوت الكمبيوتر"],
    ["browser", "مكالمة ويب"],
  ] as [CallSource, string][])("shows %s as %s in Arabic", (source, name) => {
    expect(sourceName(source, "ar")).toBe(name);
  });

  it.each(["zoom", "teams", "meet", "whatsapp", "3cx", "yeastar"] as CallSource[])(
    "keeps the brand name %s unchanged in Arabic",
    (source) => {
      expect(sourceName(source, "ar")).toBe(sourceName(source, "en"));
    },
  );

  it("shows Practice in English", () => {
    expect(sourceName("practice", "en")).toBe("Practice");
  });
});
