/** W1-UI (T-072): every new primitive is listed in /gallery, in light and dark, English and Arabic. */
import { render, screen } from "@testing-library/react-native";
import Gallery from "../app/gallery";

const PARTS = [
  "iconbutton",
  "disclosure",
  "checklist",
  "stattile",
  "ltrrun",
  "sheet-open",
  "toast-action",
];

describe("/gallery", () => {
  it("lists each new primitive in light/dark × en/ar, with Arabic from the string table", async () => {
    await render(<Gallery />);
    for (const part of PARTS)
      for (const scheme of ["light", "dark"])
        for (const locale of ["en", "ar"])
          expect(screen.getByTestId(`gallery-${part}-${scheme}-${locale}`)).toBeOnTheScreen();
    expect(screen.getAllByText("تراجع").length).toBe(2);
  }, 60_000);
});
