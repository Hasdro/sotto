/** INT-12 (D-072): the admin downloads last week's CSV; no live push. */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { weeklyExportPath } from "../features/crm/api";
import { WeeklyExport } from "../features/crm/WeeklyExport";
import { LocaleProvider } from "../lib/locale";

jest.mock("../lib/cloud", () => ({
  cloudApi: jest.fn(() => new Promise(() => {})),
  cloudBlob: jest.fn(async () => null),
}));

const wrap = (node: React.ReactNode, locale: "en" | "ar" = "en") =>
  render(
    <LocaleProvider initial={locale}>
      <UIProvider direction={locale === "ar" ? "rtl" : "ltr"}>{node}</UIProvider>
    </LocaleProvider>,
  );

describe("weekly export", () => {
  it("downloads the CSV from the export route", async () => {
    const blob = { size: 10 } as unknown as Blob;
    const fetchBlob = jest.fn(async () => blob);
    const save = jest.fn();
    await wrap(<WeeklyExport fetchBlob={fetchBlob} save={save} web />);
    expect(screen.getByText(/No call text/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("export-download"));
    await waitFor(() => expect(save).toHaveBeenCalledWith(blob, "agn-calls-last-week.csv"));
    expect(fetchBlob).toHaveBeenCalledWith("/api/v1/export/weekly.csv");
    expect(weeklyExportPath("2026-W46")).toBe("/api/v1/export/weekly.csv?week=2026-W46");
  });

  it("says so when the download fails", async () => {
    await wrap(<WeeklyExport fetchBlob={async () => null} save={jest.fn()} web />);
    await fireEvent.press(screen.getByTestId("export-download"));
    await waitFor(() => expect(screen.getByTestId("export-failed")).toBeOnTheScreen());
  });

  it("phones point to the web or desktop app (Arabic)", async () => {
    await wrap(<WeeklyExport web={false} />, "ar");
    expect(screen.getByText("نزّله من تطبيق الويب أو سطح المكتب.")).toBeOnTheScreen();
    expect(screen.queryByTestId("export-download")).toBeNull();
  });
});
