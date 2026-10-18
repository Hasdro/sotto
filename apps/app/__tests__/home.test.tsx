import { themes } from "@sotto/ui";
import { render, screen } from "@testing-library/react-native";
import * as RN from "react-native";
import Home from "../app/index";

describe("Home (hello screen)", () => {
  afterEach(() => jest.restoreAllMocks());

  it("shows the product name and tagline from the string table", async () => {
    await render(<Home />);
    expect(screen.getByRole("header", { name: "Sotto" })).toBeOnTheScreen();
    expect(screen.getByText("Your live sales-call copilot.")).toBeOnTheScreen();
  });

  it.each(["light", "dark"] as const)("uses the %s theme tokens", async (scheme) => {
    jest.spyOn(RN, "useColorScheme").mockReturnValue(scheme);
    await render(<Home />);
    expect(screen.getByTestId("home")).toHaveStyle({
      backgroundColor: themes[scheme].color.background,
    });
  });
});
