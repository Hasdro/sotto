import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import RootLayout from "../app/_layout";
import InboxScreen from "../app/inbox";
import PlaybookScreen from "../app/playbook";

const ITEM = {
  id: "7d3c1e0b-2a4f-4e6f-8c9b-1d2e3f4a5b6c",
  question: "Do you allow pets in the building?",
  asked_at: Date.parse("2026-10-21T03:10:00Z"),
  status: "open",
  answer: null,
};

describe("inbox on this server (D-020, R2 steps 4-5)", () => {
  it("shows questions escalated in calls and sends the added answer to the server", async () => {
    const posts: { url: string; body: unknown }[] = [];
    globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
      if (init.method === "POST" || init.method === "PUT") {
        posts.push({ url, body: JSON.parse(String(init.body)) });
        return { ok: true, status: 200, json: async () => ({}) };
      }
      const data = url.endsWith("/api/escalations")
        ? { escalations: [ITEM] }
        : url.endsWith("/api/playbook/added")
          ? { entries: [] }
          : {};
      return { ok: true, status: 200, json: async () => data };
    }) as unknown as typeof fetch;
    await renderRouter(
      { _layout: RootLayout, inbox: InboxScreen, playbook: PlaybookScreen },
      { initialUrl: "/inbox" },
    );
    expect(await screen.findByText("Do you allow pets in the building?")).toBeOnTheScreen();
    expect(screen.getByText(/Practice call/)).toBeOnTheScreen();
    await fireEvent.changeText(
      screen.getByTestId(`answer-${ITEM.id}`),
      "One cat or small dog per apartment, with building approval.",
    );
    await fireEvent.press(screen.getByTestId(`add-${ITEM.id}`));
    await waitFor(() =>
      expect(posts).toEqual([
        {
          url: `http://127.0.0.1:8787/api/escalations/${ITEM.id}/playbook`,
          body: { answer: "One cat or small dog per apartment, with building approval." },
        },
      ]),
    );
    expect(
      screen.getByText("Added to the playbook: Do you allow pets in the building?"),
    ).toBeOnTheScreen();
  });

  it("shows the conversation around the question and the agent who asked (T-034)", async () => {
    const item = {
      ...ITEM,
      transcript_excerpt: "Customer: We have a cat.\nCustomer: Do you allow pets in the building?",
      agent_name: "Sara Ali",
    };
    globalThis.fetch = jest.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.endsWith("/api/escalations") ? { escalations: [item] } : { entries: [] },
    })) as unknown as typeof fetch;
    await renderRouter({ _layout: RootLayout, inbox: InboxScreen }, { initialUrl: "/inbox" });
    expect(await screen.findByTestId(`excerpt-${ITEM.id}`)).toHaveTextContent(
      /We have a cat\.[\s\S]*Do you allow pets/,
    );
    expect(screen.getByText(/Sara Ali/)).toBeOnTheScreen();
  });

  it("is named like the menu, shows the last three turns and explains the buttons (UI-011)", async () => {
    const item = {
      ...ITEM,
      transcript_excerpt: [
        "Agent: Thanks for joining.",
        "Customer: Sure, thanks.",
        "Customer: Sure, thanks.",
        "Agent: How do you track orders?",
        "Customer: In a spreadsheet.",
        "Agent: Which one?",
        "Customer: Do you allow pets in the building?",
      ].join("\n"),
    };
    globalThis.fetch = jest.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.endsWith("/api/escalations") ? { escalations: [item] } : { entries: [] },
    })) as unknown as typeof fetch;
    await renderRouter({ _layout: RootLayout, inbox: InboxScreen }, { initialUrl: "/inbox" });
    const excerpt = await screen.findByTestId(`excerpt-${ITEM.id}`);
    expect(screen.queryByText("Unanswered questions")).toBeNull();
    expect(
      screen.getByText(/^Questions Sales Shield could not answer on calls\./),
    ).toBeOnTheScreen();
    expect(excerpt).toHaveTextContent(
      /Customer: In a spreadsheet\.Agent: Which one\?Customer: Do you allow pets/,
    );
    expect(excerpt).not.toHaveTextContent(/Thanks for joining/);
    const toggle = screen.getByTestId(`excerpt-toggle-${ITEM.id}`);
    expect(toggle).toHaveTextContent("Show all 6 lines");
    await fireEvent.press(toggle);
    expect(excerpt).toHaveTextContent(
      /Agent: Thanks for joining\.Customer: Sure, thanks\.Agent: How/,
    );
    expect(screen.getByTestId(`excerpt-toggle-${ITEM.id}`)).toHaveTextContent("Show less");
    expect(screen.getByTestId(`answer-cap-${ITEM.id}`)).toHaveTextContent(
      "Agents read this on a live card, so keep it to 25 words.",
    );
    const buttons = within(screen.getByTestId(`answer-actions-${ITEM.id}`)).getAllByRole("button");
    expect(buttons.map((b) => b.props.testID)).toEqual([`add-${ITEM.id}`, `save-${ITEM.id}`]);
    expect(buttons.map((b) => b.props.accessibilityLabel)).toEqual([
      "Add to playbook",
      "Save answer only",
    ]);
    expect(screen.getByTestId(`answer-why-${ITEM.id}`)).toHaveTextContent(
      "Added answers reach every agent from their next call. A saved answer waits under Answered and is not used on calls.",
    );
  });
});
