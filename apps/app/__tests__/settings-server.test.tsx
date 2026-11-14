import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import SettingsScreen from "../app/admin/settings";
import { LocaleProvider } from "../lib/locale";

describe("company settings on this server (D-020)", () => {
  it("loads the saved settings and saves a change for the next call", async () => {
    const puts: unknown[] = [];
    let settings = {
      ai_answers_allowed: true,
      backup_allowed: true,
      card_language: "auto",
    };
    globalThis.fetch = jest.fn(async (_url: string, init: RequestInit) => {
      if (init.method === "PUT") {
        const patch = JSON.parse(String(init.body));
        puts.push(patch);
        settings = { ...settings, ...patch };
      }
      return { ok: true, status: 200, json: async () => ({ settings }) };
    }) as unknown as typeof fetch;
    await render(
      <LocaleProvider>
        <SettingsScreen />
      </LocaleProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("toggle-ai")).toBeChecked());
    await fireEvent(screen.getByTestId("toggle-ai"), "valueChange", false);
    await waitFor(() => expect(puts).toEqual([{ ai_answers_allowed: false }]));
    expect(screen.getByTestId("toggle-ai")).not.toBeChecked();
  });
});
