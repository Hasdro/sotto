import { themes } from "@sotto/ui";
import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
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

    // UI-012: Remove is a quiet red link that asks first; Cancel keeps the answer.
    const remove = screen.getByTestId("remove-custom:1");
    expect(within(remove).getByText("Remove")).toHaveStyle({ color: themes.light.color.danger });
    await fireEvent.press(remove);
    expect(screen.getByTestId("remove-ask-custom:1")).toHaveTextContent(
      "Remove this answer? Agents stop getting it from their next call.",
    );
    await fireEvent.press(screen.getByTestId("remove-cancel-custom:1"));
    expect(screen.queryByTestId("remove-ask-custom:1")).toBeNull();
    expect(calls.map((c) => c.method)).toEqual(["GET", "POST", "PUT"]);
    await fireEvent.press(screen.getByTestId("remove-custom:1"));
    await fireEvent.press(screen.getByTestId("remove-confirm-custom:1"));
    await waitFor(() => expect(screen.queryByText("Added by a manager")).toBeNull());
    expect(calls.map((c) => c.method)).toEqual(["GET", "POST", "PUT", "DELETE"]);
  });

  it("makes Add an answer the primary action, keeps source badges quiet and explains tags (UI-012)", async () => {
    const entry: Entry = {
      id: "custom:9",
      question: "Is it too expensive?",
      answer: "Most teams earn it back in a quarter.",
      tags: ["price"],
      source: "custom",
      updated_at: 1,
    };
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ entries: [entry] }),
    })) as unknown as typeof fetch;
    await renderRouter(
      { _layout: RootLayout, playbook: PlaybookScreen },
      { initialUrl: "/playbook" },
    );
    const add = await screen.findByTestId("playbook-add");
    expect(add).toHaveStyle({ backgroundColor: themes.light.color.primary });
    expect(screen.getByTestId("source-custom:9")).not.toHaveStyle({
      backgroundColor: themes.light.color.primary,
    });
    await fireEvent.press(add);
    expect(screen.getByTestId("form-tags-hint")).toHaveTextContent(
      /Other words customers use for this question.*Calls match on the question and these words\./,
    );
    expect(screen.getByTestId("form-answer-cap")).toHaveTextContent(
      "Agents read this on a live card, so keep it to 25 words.",
    );
  });
});
