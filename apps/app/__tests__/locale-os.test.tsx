/** ZC A1: on the first start the app speaks the computer's language; a saved choice wins. */
import { osLocale } from "../lib/locale";

const g = globalThis as { navigator?: unknown };
const saved = g.navigator;
afterEach(() => {
  g.navigator = saved;
});

describe("first-start language", () => {
  it("picks Arabic when the OS asks for Arabic", () => {
    g.navigator = { languages: ["ar-AE", "en-US"], language: "ar-AE" };
    expect(osLocale()).toBe("ar");
    g.navigator = { language: "ar" };
    expect(osLocale()).toBe("ar");
  });

  it("falls back to English for any other language", () => {
    g.navigator = { languages: ["fr-FR"] };
    expect(osLocale()).toBe("en");
    g.navigator = { languages: ["en-GB", "ar"] };
    expect(osLocale()).toBe("en");
  });
});
