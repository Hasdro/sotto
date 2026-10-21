/** Settings → AI knowledge (owner, 22 Oct): admins write what the AI must know; it saves to the
 * company's settings; other roles never see it. */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Knowledge } from "../features/settings/Knowledge";
import { LocaleProvider } from "../lib/locale";
import { api } from "../lib/server";

let mockRole = "admin";
jest.mock("../lib/useCloud", () => ({
  useCloud: () => ({ status: "signed_in", me: { user: { id: "u1", role: mockRole } } }),
}));
jest.mock("../lib/server", () => ({ api: jest.fn() }));

const wrap = () =>
  render(
    <LocaleProvider>
      <UIProvider direction="ltr">
        <Knowledge />
      </UIProvider>
    </LocaleProvider>,
  );

describe("AI knowledge", () => {
  beforeEach(() => {
    mockRole = "admin";
    jest.mocked(api).mockReset();
    jest
      .mocked(api)
      .mockImplementation(async (_p: string, init?: { method?: string; body?: unknown }) => ({
        settings: {
          context:
            init?.method === "PUT" ? (init.body as { context: string }).context : "We sell solar.",
        },
      }));
  });

  it("loads the company's knowledge and saves the edit", async () => {
    await wrap();
    const field = await screen.findByDisplayValue("We sell solar.");
    await fireEvent.changeText(field, "  We sell solar in Dubai.  ");
    await fireEvent.press(screen.getByTestId("knowledge-save"));
    await waitFor(() =>
      expect(jest.mocked(api)).toHaveBeenCalledWith("/api/company/settings", {
        method: "PUT",
        body: { context: "We sell solar in Dubai." },
      }),
    );
    expect(await screen.findByText("Saved. The next call uses it.")).toBeOnTheScreen();
  });

  it("is not shown to agents or managers", async () => {
    mockRole = "agent";
    await wrap();
    expect(screen.queryByTestId("settings-knowledge")).toBeNull();
    expect(jest.mocked(api)).not.toHaveBeenCalled();
  });
});
