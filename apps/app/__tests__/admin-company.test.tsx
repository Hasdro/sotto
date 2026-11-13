/** UX-29, ZC B16: recordings, devices and activity are reachable from one Company page. */
import { UIProvider } from "@sotto/ui";
import { render, screen, waitFor } from "@testing-library/react-native";
import CompanyActivityScreen from "../app/admin/company";
import { cloudApi } from "../lib/cloud";
import { LocaleProvider } from "../lib/locale";

jest.mock("../lib/cloud", () => ({ ...jest.requireActual("../lib/cloud"), cloudApi: jest.fn() }));

describe("Admin › Company activity", () => {
  it("shows Recordings, Devices and Activity as sections of one page", async () => {
    jest.mocked(cloudApi).mockResolvedValue({ calls: [], devices: [], items: [] });
    await render(
      <LocaleProvider initial="en">
        <UIProvider direction="ltr">
          <CompanyActivityScreen />
        </UIProvider>
      </LocaleProvider>,
    );
    for (const id of ["recordings", "devices", "activity"])
      expect(screen.getByTestId(`admin-company-${id}`)).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Recordings" })).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Devices" })).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Activity" })).toBeOnTheScreen();
    await waitFor(() =>
      expect(jest.mocked(cloudApi)).toHaveBeenCalledWith("/api/v1/devices?all=1"),
    );
  });
});
