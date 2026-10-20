import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import RootLayout from "../app/_layout";
import PlaybookScreen from "../app/playbook";

type Entry = {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  source: string;
  updated_at: number | null;
};

describe("playbook editor on this server (P3.5, D-020)", () => {
  it("shows the server playbook and lets a manager add, edit and remove an answer", async () => {
    let entries: Entry[] = [
      {
        id: "file:faq.md#what-is-the-payment-plan",
        question: "What is the payment plan?",
        answer: "Ten percent on booking.",
        tags: ["payment"],
        source: "file",
        updated_at: null,
      },
    ];
    const calls: { method: string; url: string; body?: unknown }[] = [];
    globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
      const method = init.method ?? "GET";
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      if (url.includes("/api/playbook") && !url.endsWith("/added")) {
        calls.push({ method, url, body });
        if (method === "POST") {
          entries = [{ id: "custom:1", ...body, source: "custom", updated_at: 1 }, ...entries];
        } else if (method === "PUT") {
          entries = entries.map((e) => (e.id === "custom:1" ? { ...e, ...body } : e));
        } else if (method === "DELETE") {
          entries = entries.filter((e) => e.id !== "custom:1");
        }
        return { ok: true, status: 200, json: async () => ({ entries }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }) as unknown as typeof fetch;
    await renderRouter(
      { _layout: RootLayout, playbook: PlaybookScreen },
      { initialUrl: "/playbook" },
    );
    expect(await screen.findByText("Playbook file")).toBeOnTheScreen();
    expect(screen.queryByTestId("edit-file:faq.md#what-is-the-payment-plan")).toBeNull();

    await fireEvent.press(screen.getByTestId("playbook-add"));
    await fireEvent.changeText(screen.getByTestId("form-question"), "Do you allow pets?");
    await fireEvent.changeText(screen.getByTestId("form-answer"), "One cat or small dog.");
    await fireEvent.changeText(screen.getByTestId("form-tags"), "pets, rules");
    await fireEvent.press(screen.getByTestId("form-save"));
    expect(await screen.findByText("Added by a manager")).toBeOnTheScreen();
    expect(calls[1]).toMatchObject({
      method: "POST",
      body: {
        question: "Do you allow pets?",
        answer: "One cat or small dog.",
        tags: ["pets", "rules"],
      },
    });

    await fireEvent.press(screen.getByTestId("edit-custom:1"));
    await fireEvent.changeText(
      screen.getByTestId("form-answer"),
      "One cat or small dog, approved.",
    );
    await fireEvent.press(screen.getByTestId("form-save"));
    expect(await screen.findByText("One cat or small dog, approved.")).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId("remove-custom:1"));
    await fireEvent.press(screen.getByTestId("remove-custom:1")); // second tap confirms
    await waitFor(() => expect(screen.queryByText("Added by a manager")).toBeNull());
    expect(calls.map((c) => c.method)).toEqual(["GET", "POST", "PUT", "DELETE"]);
  });
});
