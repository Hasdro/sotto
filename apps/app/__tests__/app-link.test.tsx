/** In-app links switch screens without reloading the app (owner, 22 Oct: slow section switching). */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { AppLink, plainClick } from "../components/AppLink";

const mockNavigate = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ navigate: mockNavigate }) }));

describe("AppLink", () => {
  beforeEach(() => mockNavigate.mockReset());

  it("routes inside the app and stops the browser from loading the page", async () => {
    const closed = jest.fn();
    await render(
      <AppLink href="/history" onNavigate={closed} testID="go">
        <Text>History</Text>
      </AppLink>,
    );
    const preventDefault = jest.fn();
    await fireEvent.press(screen.getByTestId("go"), { preventDefault, nativeEvent: {} });
    expect(preventDefault).toHaveBeenCalled();
    expect(closed).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/history");
    expect(screen.getByRole("link", { name: "History" })).toBeOnTheScreen();
  });

  it("leaves cmd-, ctrl- and middle-clicks to the browser", () => {
    expect(plainClick({ nativeEvent: {} } as never)).toBe(true);
    expect(plainClick({ metaKey: true, nativeEvent: {} } as never)).toBe(false);
    expect(plainClick({ nativeEvent: { ctrlKey: true } } as never)).toBe(false);
    expect(plainClick({ button: 1, nativeEvent: {} } as never)).toBe(false);
  });
});
