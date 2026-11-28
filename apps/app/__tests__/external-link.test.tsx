/** UI-014: a button that leaves the app shows the external-link mark and says where it went, so
 * a browser opening behind the app never looks like a dead click. */
import { UIProvider } from "@sotto/ui";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import { ExternalLinkButton } from "../components/ExternalLinkButton";
import { LocaleProvider } from "../lib/locale";

const wrap = (locale: "en" | "ar" = "en") =>
  render(
    <LocaleProvider initial={locale}>
      <UIProvider direction={locale === "ar" ? "rtl" : "ltr"}>
        <ExternalLinkButton label="Get the apps" url="https://example.test/downloads/" testID="x" />
      </UIProvider>
    </LocaleProvider>,
  );

describe("ExternalLinkButton (UI-014)", () => {
  afterEach(() => jest.restoreAllMocks());

  it("opens the URL, shows the external mark and says it opened in the browser", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await wrap();
    expect(screen.getByTestId("icon-external", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId("x")).toHaveProp("accessibilityHint", "Opens in your browser");
    await act(async () => fireEvent.press(screen.getByTestId("x")));
    expect(open).toHaveBeenCalledWith("https://example.test/downloads/");
    expect(screen.getByTestId("x-opened")).toHaveTextContent("Opened in your browser.");
  });

  it("says so when the link could not open", async () => {
    jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no handler"));
    await wrap("ar");
    await act(async () => fireEvent.press(screen.getByTestId("x")));
    expect(screen.getByTestId("x-opened")).toHaveTextContent("تعذّر فتح الرابط.");
  });
});
