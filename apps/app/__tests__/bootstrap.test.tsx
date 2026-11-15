/** ZC-04 (D-066): the playbook bootstrap panel. No consent → nothing to draft; the device drafts
 * pairs on the summary model and sends only the pairs; each draft waits for Approve or Discard. */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { BootstrapPanel } from "../features/bootstrap/BootstrapPanel";
import { parsePairs } from "../features/bootstrap/draft";
import { LocaleProvider } from "../lib/locale";

const mockApi = jest.fn();
jest.mock("../lib/cloud", () => ({ cloudApi: (...a: unknown[]) => mockApi(...a) }));
let mockCloud: Record<string, unknown> = { status: "signed_out" };
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../lib/useCloud", () => ({ useCloud: () => mockCloud }));
const mockStream = jest.fn();
jest.mock("@sotto/engine", () => ({
  ...jest.requireActual("@sotto/engine"),
  buildRuntime: () => ({ router: { stream: (...a: unknown[]) => mockStream(...a) } }),
}));

const BUNDLE = {
  company: { name: "Acme Solar" },
  prompts: {
    playbook_bootstrap: {
      key: "playbook_bootstrap",
      version: 1,
      stage: "summary",
      variables: [],
      body: "For {{company.name}} from {{bootstrap.source}}:\n{{bootstrap.material}}",
    },
  },
} as never;

const DRAFT = {
  id: "d1",
  source: "website",
  question: "How long does installation take?",
  answer: "Two days.",
  tags: [],
  status: "needs_review",
  created_at: 1,
};

function state(over: Record<string, unknown> = {}) {
  return { consent: true, domains: ["acme.test"], zoho: false, drafts: [], ...over };
}

const wrap = (locale: "en" | "ar" = "en", onApproved = jest.fn()) =>
  render(
    <LocaleProvider initial={locale}>
      <UIProvider direction={locale === "ar" ? "rtl" : "ltr"}>
        <BootstrapPanel bundle={BUNDLE} onApproved={onApproved} />
      </UIProvider>
    </LocaleProvider>,
  );

async function* reply(text: string) {
  yield text;
}

beforeEach(() => {
  mockCloud = { status: "signed_out" };
  mockApi.mockReset();
  mockStream.mockReset();
});

describe("playbook bootstrap", () => {
  it("is off until the admin turns it on (D-076): says why and calls no route", async () => {
    mockCloud = {
      status: "signed_in",
      me: {
        user: { id: "u", role: "admin" },
        features: { playbook_bootstrap: { state: "off_by_org" } },
      },
    };
    mockApi.mockResolvedValue(state());
    await wrap();
    expect(screen.getByTestId("feature-off-playbook_bootstrap")).toBeOnTheScreen();
    expect(screen.getByText("Playbook drafts")).toBeOnTheScreen();
    expect(screen.queryByTestId("bootstrap-run")).toBeNull();
    expect(mockApi).not.toHaveBeenCalled();
  });

  it("is hidden from a role it is not for", async () => {
    mockCloud = {
      status: "signed_in",
      me: {
        user: { id: "u", role: "agent" },
        features: { playbook_bootstrap: { state: "no_permission" } },
      },
    };
    await wrap();
    expect(screen.queryByTestId("feature-off-playbook_bootstrap")).toBeNull();
    expect(mockApi).not.toHaveBeenCalled();
  });

  it("drafts nothing before the consent record exists", async () => {
    mockApi.mockResolvedValue(state({ consent: false }));
    await wrap();
    expect(await screen.findByTestId("bootstrap-consent")).toBeOnTheScreen();
    expect(screen.queryByTestId("bootstrap-run")).toBeNull();
  });

  it("drafts from a website page on the device and sends only the pairs for review", async () => {
    let drafts: unknown[] = [];
    mockApi.mockImplementation(async (path: string, init: { body: { items: unknown[] } }) => {
      if (path === "/api/v1/playbook/bootstrap") return state({ drafts });
      if (path.endsWith("/material")) return { source: "website", text: "Installation: two days." };
      if (path.endsWith("/drafts")) {
        drafts = [DRAFT];
        return { added: init.body.items.length };
      }
      throw new Error(path);
    });
    mockStream.mockReturnValue(reply("Q: How long does installation take?\nA: Two days.\n"));
    await wrap();
    expect(await screen.findByText("Only acme.test can be read, over https.")).toBeOnTheScreen();
    expect(screen.getByTestId("bootstrap-run")).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId("bootstrap-url"), "https://acme.test/faq");
    await fireEvent.press(screen.getByTestId("bootstrap-run"));
    expect(await screen.findByTestId("bootstrap-added")).toHaveTextContent(
      "1 drafts are waiting for review below.",
    );
    expect(mockApi).toHaveBeenCalledWith("/api/v1/playbook/bootstrap/material", {
      method: "POST",
      body: { source: "website", url: "https://acme.test/faq" },
    });
    expect(mockStream.mock.calls[0][0]).toBe("summary");
    expect(mockStream.mock.calls[0][1].messages[0].content).toContain("Installation: two days.");
    expect(mockApi).toHaveBeenCalledWith("/api/v1/playbook/bootstrap/drafts", {
      method: "POST",
      body: {
        source: "website",
        items: [{ question: "How long does installation take?", answer: "Two days." }],
      },
    });
    expect(await screen.findByTestId("draft-d1")).toBeOnTheScreen();
  });

  it("keeps a pasted document on the device: no material read, only pairs", async () => {
    mockApi.mockImplementation(async (path: string) =>
      path.endsWith("/drafts") ? { added: 1 } : state(),
    );
    mockStream.mockReturnValue(reply("Q: Warranty?\nA: Ten years."));
    await wrap();
    await fireEvent.press(await screen.findByText("Paste text"));
    await fireEvent.changeText(screen.getByTestId("bootstrap-text"), "Our warranty is ten years.");
    await fireEvent.press(screen.getByTestId("bootstrap-run"));
    await screen.findByTestId("bootstrap-added");
    const paths = mockApi.mock.calls.map((c) => c[0]);
    expect(paths.some((p: string) => p.endsWith("/material"))).toBe(false);
    expect(JSON.stringify(mockApi.mock.calls)).not.toContain("Our warranty is ten years.");
  });

  it("approves an edited draft (one playbook entry) or discards it", async () => {
    let drafts: unknown[] = [DRAFT, { ...DRAFT, id: "d2", question: "Do you finance?" }];
    mockApi.mockImplementation(async (path: string) => {
      if (path === "/api/v1/playbook/bootstrap") return state({ drafts });
      const id = path.split("/").at(-2);
      drafts = drafts.filter((d) => (d as { id: string }).id !== id);
      return { id, status: path.endsWith("approve") ? "approved" : "rejected" };
    });
    const onApproved = jest.fn();
    await wrap("en", onApproved);
    expect(await screen.findByText("Needs review (2)")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId("draft-answer-d1"), "About two days on site.");
    await fireEvent.press(screen.getByTestId("draft-approve-d1"));
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith("/api/v1/playbook/bootstrap/drafts/d1/approve", {
        method: "POST",
        body: { question: "How long does installation take?", answer: "About two days on site." },
      }),
    );
    await waitFor(() => expect(onApproved).toHaveBeenCalledTimes(1));
    await fireEvent.press(await screen.findByTestId("draft-reject-d2"));
    await waitFor(() => expect(screen.queryByTestId("bootstrap-review")).toBeNull());
    expect(onApproved).toHaveBeenCalledTimes(1);
  });

  it("shows the panel in Arabic", async () => {
    mockApi.mockResolvedValue(state({ drafts: [DRAFT] }));
    await wrap("ar");
    expect(await screen.findByText("مسودة أول دليل مبيعات")).toBeOnTheScreen();
    expect(screen.getByText("بانتظار المراجعة (1)")).toBeOnTheScreen();
  });
});

describe("parsePairs", () => {
  it("reads Q/A pairs, caps answers at 40 words, drops duplicates and junk", () => {
    const long = Array.from({ length: 50 }, (_, i) => `w${i}`).join(" ");
    expect(parsePairs(`Q: One?\nA: Yes.\n\nQ: One?\nA: Again.\nQ: Two?\nA: ${long}`)).toEqual([
      { question: "One?", answer: "Yes." },
      { question: "Two?", answer: long.split(" ").slice(0, 40).join(" ") },
    ]);
    expect(parsePairs("NONE")).toEqual([]);
    expect(parsePairs("I cannot help with that.")).toBeNull();
  });
});
