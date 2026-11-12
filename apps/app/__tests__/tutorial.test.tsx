/** The practice tutorial (T-038): it walks through the steps and can be turned off for good. */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { TutorialDialog } from "../components/Tutorial";

describe("tutorial", () => {
  it("walks through five steps and closes on the last", async () => {
    const onClose = jest.fn();
    await render(<TutorialDialog onClose={onClose} />);
    for (let i = 0; i < 4; i++) await fireEvent.press(screen.getByTestId("tutorial-next"));
    expect(screen.getByText("Start using Sales Shield")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("tutorial-next"));
    expect(onClose).toHaveBeenCalledWith(false);
  });

  it("remembers 'Don't show this again'", async () => {
    const onClose = jest.fn();
    await render(<TutorialDialog onClose={onClose} />);
    await fireEvent.press(screen.getByTestId("tutorial-never"));
    await fireEvent.press(screen.getByTestId("tutorial-close"));
    expect(onClose).toHaveBeenCalledWith(true);
  });
});
