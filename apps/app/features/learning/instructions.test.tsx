/** T-060: the instruction editor: edit, reorder, disable, delete, add, versions, revert, review
 * switch, approve, badge. And D-038: desktop hides the model screens behind a web-panel link. */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockApi = jest.fn();
let mockDesktop: object | null = null;
jest.mock("../../lib/cloud", () => ({
  cloudApi: (...a: unknown[]) => mockApi(...a),
  cloudOrigin: () => "https://admin.example.com",
}));
jest.mock("../../lib/useCloud", () => ({
  useCloud: () => ({ status: "signed_in", me: { user: { role: "admin" }, features: {} } }),
}));
jest.mock("../../lib/desktop", () => ({ desktop: () => mockDesktop }));

import InstructionsRoute from "../../app/admin/instructions";
import KeysScreen from "../../app/admin/keys";
import { LocaleProvider } from "../../lib/locale";
import type { Learning } from "./api";
import { resetLearningBadge, useLearningBadge } from "./badge";

const item = (id: string, text: string, enabled = true) => ({
  id,
  text,
  enabled,
  source_call: "abcdef12-0000",
  added_at: 0,
});
const learning = (over: Partial<Learning> = {}): Learning => ({
  active_version: 2,
  review_before_apply: false,
  items: [item("a", "Keep it short."), item("b", "Name the next step.")],
  versions: [
    {
      version: 3,
      status: "pending",
      origin: "learning",
      source_call: "c",
      actor: "Agnes",
      created_at: 0,
      items: [item("z", "Pending rule.")],
      active: false,
    },
    {
      version: 2,
      status: "applied",
      origin: "learning",
      source_call: "c",
      actor: "Agnes",
      created_at: 0,
      items: [],
      active: true,
    },
    {
      version: 1,
      status: "applied",
      origin: "edit",
      source_call: null,
      actor: "Ada",
      created_at: 0,
      items: [],
      active: false,
    },
  ],
  pending: [3],
  new: 1,
  limits: { items: 8, words: 25 },
  ...over,
});
const SUMMARY = {
  days: 30,
  total: 3,
  up: 1,
  down: 2,
  calls: 1,
  reasons: { too_long: 2, wrong: 0, not_our_style: 0, good_phrasing: 1 },
  by_type: {},
  people: [{ name: "Agnes", up: 1, down: 2 }],
};

/** No version waiting: the editor is shown (UX-31 hides it while one waits). */
const decided = (over: Partial<Learning> = {}) =>
  learning({
    versions: learning().versions.filter((v) => v.status !== "pending"),
    pending: [],
    ...over,
  });

function serve(l: Learning) {
  mockApi.mockImplementation(async (path: string, init?: { body?: unknown }) => {
    if (path.startsWith("/api/v1/ratings/summary")) return SUMMARY;
    if (path === "/api/v1/learning/seen") return { ok: true };
    if (path === "/api/v1/learning/instructions") {
      type Body = { items: { id?: string; text: string; enabled: boolean }[] };
      const items = (init?.body as Body | undefined)?.items ?? [];
      return decided({ items: items.map((i) => item(i.id ?? "n", i.text, i.enabled)) });
    }
    return l;
  });
}

const wrap = (ui: React.ReactElement) =>
  render(
    <LocaleProvider>
      <UIProvider direction="ltr">{ui}</UIProvider>
    </LocaleProvider>,
  );

describe("instruction editor", () => {
  beforeEach(() => {
    mockApi.mockReset();
    mockDesktop = null;
  });

  it("edits, reorders, disables, deletes and adds, then saves one new version", async () => {
    serve(decided());
    await wrap(<InstructionsRoute />);
    expect(await screen.findByDisplayValue("Keep it short.")).toBeOnTheScreen();
    expect(screen.getByTestId("instructions-new")).toBeOnTheScreen();
    expect(screen.getByText("1 helpful · 2 not helpful · 1 calls")).toBeOnTheScreen();
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith("/api/v1/learning/seen", expect.anything()),
    );
    await fireEvent.press(screen.getByTestId("instruction-down-0"));
    await fireEvent.changeText(screen.getByTestId("instruction-text-0"), "Name one next step.");
    await fireEvent(screen.getByTestId("instruction-on-1"), "valueChange", false);
    await fireEvent.press(screen.getByTestId("instruction-add"));
    await fireEvent.changeText(
      screen.getByTestId("instruction-text-2"),
      "Use the customer's name.",
    );
    await fireEvent.press(screen.getByTestId("instructions-save"));
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith("/api/v1/learning/instructions", {
        method: "PUT",
        body: {
          items: [
            { id: "b", text: "Name one next step.", enabled: true },
            { id: "a", text: "Keep it short.", enabled: false },
            { text: "Use the customer's name.", enabled: true },
          ],
        },
      }),
    );
    await fireEvent.press(screen.getByTestId("instruction-delete-0"));
    expect(screen.queryByDisplayValue("Name one next step.")).toBeNull();
  });

  it("blocks saving an instruction over 25 words", async () => {
    serve(decided());
    await wrap(<InstructionsRoute />);
    await screen.findByDisplayValue("Keep it short.");
    // UX-31: no counter until an instruction is long.
    expect(screen.queryByTestId("instruction-words-0")).toBeNull();
    await fireEvent.changeText(screen.getByTestId("instruction-text-0"), "word ".repeat(20));
    expect(screen.queryByTestId("instruction-words-0")).toBeNull();
    await fireEvent.changeText(screen.getByTestId("instruction-text-0"), "word ".repeat(21));
    expect(screen.getByText("21/25 words")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId("instruction-text-0"), "word ".repeat(26));
    expect(screen.getByText("26/25 words")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("instructions-save"));
    expect(mockApi).not.toHaveBeenCalledWith("/api/v1/learning/instructions", expect.anything());
  });

  it("shows a pending version as a diff and hides the editor until it is decided (UX-31)", async () => {
    serve(learning());
    await wrap(<InstructionsRoute />);
    expect(await screen.findByTestId("pending-3")).toBeOnTheScreen();
    expect(screen.getByTestId("diff-added-0")).toHaveTextContent(/Pending rule\./);
    expect(screen.getByTestId("diff-removed-1")).toHaveTextContent(/Keep it short\./);
    expect(screen.getByTestId("diff-removed-2")).toHaveTextContent(/Name the next step\./);
    expect(screen.queryByTestId("instructions-editor")).toBeNull();
    expect(screen.getByTestId("instructions-decide-first")).toBeOnTheScreen();
    serve(decided()); // the server's answer to the rejection
    await fireEvent.press(screen.getByTestId("reject-3"));
    await waitFor(() => expect(screen.getByTestId("instructions-editor")).toBeOnTheScreen());
  });

  it("names the call an instruction came from, never its id (UX-06c)", async () => {
    serve(
      decided({
        items: [
          { ...item("a", "Keep it short."), source_label: "Sara Haddad", added_at: Date.UTC(2026, 10, 12) },
          { ...item("b", "Name the next step."), added_at: Date.UTC(2026, 10, 12) },
        ],
      }),
    );
    await wrap(<InstructionsRoute />);
    expect(await screen.findByText("From the call with Sara Haddad, Nov 12")).toBeOnTheScreen();
    expect(screen.getByText("From a call, Nov 12")).toBeOnTheScreen();
    expect(screen.queryByText(/abcdef12/)).toBeNull();
  });

  it("reorder and delete controls are at least 44 px", async () => {
    serve(decided());
    await wrap(<InstructionsRoute />);
    await screen.findByDisplayValue("Keep it short.");
    for (const id of ["instruction-up-1", "instruction-down-0", "instruction-delete-0"]) {
      const style = [screen.getByTestId(id).props.style].flat(3).reduce(
        (a: Record<string, number>, b: Record<string, number> | null) => ({ ...a, ...b }),
        {},
      );
      expect(style.minWidth).toBeGreaterThanOrEqual(44);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
  });

  it("approves a pending version, reverts an old one and flips the review switch", async () => {
    serve(learning());
    await wrap(<InstructionsRoute />);
    await fireEvent.press(await screen.findByTestId("approve-3"));
    expect(mockApi).toHaveBeenCalledWith("/api/v1/learning/versions/3/approve", {
      method: "POST",
      body: {},
    });
    await waitFor(() => expect(screen.getByTestId("revert-1")).toBeOnTheScreen());
    expect(screen.queryByTestId("revert-2")).toBeNull(); // the active version
    await fireEvent.press(screen.getByTestId("revert-1"));
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith("/api/v1/learning/versions/1/revert", {
        method: "POST",
        body: {},
      }),
    );
    await fireEvent(screen.getByTestId("review-switch"), "valueChange", true);
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith("/api/v1/learning/settings", {
        method: "PUT",
        body: { review_before_apply: true },
      }),
    );
  });

  it("shows the empty state when nothing was learned yet", async () => {
    serve(learning({ items: [], versions: [], pending: [], new: 0, active_version: 0 }));
    await wrap(<InstructionsRoute />);
    expect(await screen.findByTestId("instructions-empty")).toBeOnTheScreen();
    expect(screen.queryByTestId("instructions-new")).toBeNull();
  });
});

describe("badge", () => {
  function Probe({ on }: { on: boolean }) {
    const { Text } = require("react-native");
    return <Text testID="n">{String(useLearningBadge(on))}</Text>;
  }
  it("counts unseen learned versions for admins only", async () => {
    mockApi.mockReset();
    resetLearningBadge();
    serve(learning({ new: 2 }));
    await wrap(<Probe on={false} />);
    expect(screen.getByTestId("n")).toHaveTextContent("0");
    expect(mockApi).not.toHaveBeenCalled();
    await wrap(<Probe on />);
    await waitFor(() => expect(screen.getByTestId("n")).toHaveTextContent("2"));
  });
});

describe("model configuration on desktop (D-038)", () => {
  it("shows a link to the web admin panel instead of Keys & providers", async () => {
    mockApi.mockReset();
    mockDesktop = { callState: jest.fn() };
    const { Linking } = require("react-native");
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await wrap(<KeysScreen />);
    expect(screen.getByTestId("web-admin-notice")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("web-admin-link"));
    expect(open).toHaveBeenCalledWith("https://admin.example.com/admin/keys");
    expect(mockApi).not.toHaveBeenCalled(); // no provider or key request from the desktop app
  });
});
