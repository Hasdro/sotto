/** UI-002: the profile popup gives quick status and shortcuts instead of repeating the sidebar's
 * Account and Settings rows; Sign out sits apart, under a divider. */
import { themes, UIProvider } from "@sotto/ui";
import { fireEvent, render, screen } from "@testing-library/react-native";
import * as RN from "react-native";
import { ProfilePopup } from "../components/ProfilePopup";
import { LocaleProvider } from "../lib/locale";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: (h: string) => mockPush(h) }) }));
const mockSignOut = jest.fn(async () => {});
jest.mock("../lib/cloud", () => ({ signOut: () => mockSignOut() }));
jest.mock("../lib/useCloud", () => ({
  useCloud: () => ({
    status: "signed_in",
    me: {
      user: { id: "u", email: "hana@acme.test", name: "Hana Saleh", role: "admin" },
      company: { name: "Acme", status: "trial", seats_used: 3, seats: 3 },
    },
    bundle: null,
  }),
}));

const onClose = jest.fn();
const wrap = (locale: "en" | "ar" = "en") =>
  render(
    <LocaleProvider initial={locale}>
      <UIProvider direction={locale === "ar" ? "rtl" : "ltr"}>
        <ProfilePopup open onClose={onClose} />
      </UIProvider>
    </LocaleProvider>,
  );

afterEach(() => jest.restoreAllMocks());

beforeEach(() => {
  mockPush.mockReset();
  onClose.mockReset();
  delete (globalThis as { sottoDesktop?: unknown }).sottoDesktop;
  jest.replaceProperty(RN.Platform, "OS", "web");
  jest
    .spyOn(globalThis.navigator, "userAgent", "get")
    .mockReturnValue("Mozilla/5.0 (Macintosh; Intel Mac OS X)");
});

describe("profile popup (UI-002)", () => {
  it("no longer repeats the sidebar's Account and Settings rows", async () => {
    await wrap();
    expect(screen.queryByRole("button", { name: "Account" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
    expect(screen.getByText("hana@acme.test")).toBeOnTheScreen();
  });

  it("shows the theme and language and opens Settings › Appearance", async () => {
    await wrap();
    const row = screen.getByTestId("profile-appearance");
    expect(row).toHaveTextContent(/Match my computer · English/);
    await fireEvent.press(row);
    expect(onClose).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/settings#appearance");
  });

  it("lists the search shortcut in a browser, and the call shortcuts only in the desktop app", async () => {
    await wrap();
    expect(screen.getByTestId("profile-shortcuts")).toHaveTextContent(/Search.*⌘K/);
    expect(screen.queryByText("Copy the card")).toBeNull();

    (globalThis as { sottoDesktop?: unknown }).sottoDesktop = {};
    await wrap();
    const keys = screen.getByTestId("profile-shortcuts");
    expect(keys).toHaveTextContent(/Start or end listening.*⌃⌥S/);
    expect(keys).toHaveTextContent(/Copy the card.*⌃⌥C/);
    expect(keys).toHaveTextContent(/Show the mini window.*⌃⌥M/);
  });

  it("has no shortcut list on a phone", async () => {
    jest.replaceProperty(RN.Platform, "OS", "ios");
    await wrap();
    expect(screen.queryByTestId("profile-shortcuts")).toBeNull();
  });

  it("puts Sign out apart, in the danger colour, and signs out", async () => {
    await wrap();
    const out = screen.getByTestId("profile-signout");
    expect(screen.getByText("Sign out")).toHaveStyle({ color: themes.light.color.danger });
    await fireEvent.press(out);
    expect(mockSignOut).toHaveBeenCalled();
    expect(screen.getByTestId("profile-signout-divider")).toBeOnTheScreen();
  });

  it("opens next to the profile button: left in English, right in Arabic", async () => {
    await wrap();
    expect(screen.getByTestId("profile-popup")).toHaveStyle({ left: 16 });
    await wrap("ar");
    expect(screen.getByTestId("profile-popup")).toHaveStyle({ right: 16 });
  });

  it("reads right to left in Arabic", async () => {
    await wrap("ar");
    expect(screen.getByTestId("profile-appearance")).toHaveTextContent(/مثل جهازي · العربية/);
    expect(screen.getByText("تسجيل الخروج")).toBeOnTheScreen();
  });
});
