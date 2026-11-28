/** UX-001 follow-up (CI a11y, axe `label-content-name-mismatch`): on web the sidebar Search button
 * shows its shortcut, so its accessible name must include that text, not just "Search". */
import { UIProvider } from "@sotto/ui";
import { render, screen } from "@testing-library/react-native";
import * as RN from "react-native";
import { SearchButton } from "../components/AppShell";
import { LocaleProvider } from "../lib/locale";

// An own value, deleted after each test: jest shares `navigator` between the files of a worker.
const setUA = (ua: string) =>
  Object.defineProperty(globalThis.navigator, "userAgent", { value: ua, configurable: true });

afterEach(() => {
  delete (globalThis.navigator as { userAgent?: string }).userAgent;
  jest.restoreAllMocks();
});

const wrap = (locale: "en" | "ar" = "en") =>
  render(
    <LocaleProvider initial={locale}>
      <UIProvider direction={locale === "ar" ? "rtl" : "ltr"}>
        <SearchButton onPress={() => {}} />
      </UIProvider>
    </LocaleProvider>,
  );

describe("sidebar Search button", () => {
  it("names itself with the shortcut it shows on web, in English and Arabic", async () => {
    jest.replaceProperty(RN.Platform, "OS", "web");
    setUA("Mozilla/5.0 (X11; Linux x86_64)");
    await wrap();
    expect(screen.getByRole("button", { name: /^Search\W*Ctrl K\W*$/ })).toBeOnTheScreen();
    await wrap("ar");
    expect(screen.getByRole("button", { name: /^بحث\W*Ctrl K\W*$/ })).toBeOnTheScreen();
  });

  it("is just Search on a phone, which has no shortcut", async () => {
    jest.replaceProperty(RN.Platform, "OS", "ios");
    await wrap();
    expect(screen.getByRole("button", { name: "Search" })).toBeOnTheScreen();
  });
});
