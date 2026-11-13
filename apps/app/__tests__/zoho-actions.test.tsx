/** Post-call and during-call Zoho actions (R12, T-061, T-062) and the connect confirmation:
 * nothing is written before its own approval, a retry reuses the card's key, and the screen
 * notices a finished connect when the window comes back to the front. */
import { UIProvider } from "@sotto/ui";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ActionCard, localToIso } from "../features/actions/ActionCard";
import { PostCallPanel, QuickActions } from "../features/actions/PostCallPanel";
import type { Brief } from "../features/crm/api";
import { attachBrief, resetCall } from "../features/crm/attached";
import { useZoho } from "../features/crm/useZoho";
import { ZohoConnect } from "../features/crm/ZohoConnect";
import { LocaleProvider } from "../lib/locale";

let mockCloud: unknown = { status: "off" };
jest.mock("../lib/useCloud", () => ({ useCloud: () => mockCloud }));
jest.mock("../lib/cloud", () => {
  class CloudError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return { CloudError, cloudApi: jest.fn(() => new Promise(() => {})), refreshFeatures: jest.fn() };
});
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
const cloud = jest.requireMock("../lib/cloud") as {
  cloudApi: jest.Mock;
  refreshFeatures: jest.Mock;
  CloudError: new (s: number, c: string, m: string) => Error;
};

const wrap = (node: React.ReactNode) =>
  render(
    <LocaleProvider initial="en">
      <UIProvider direction="ltr">{node}</UIProvider>
    </LocaleProvider>,
  );

const BRIEF: Brief = {
  person: {
    module: "Contacts",
    id: "4150868000000224005",
    name: "Jane Doe",
    title: "CFO",
    email: "jane@acme.test",
    phone: "+1 555",
  },
  account: null,
  deals: [
    {
      id: "4150868000000400001",
      name: "Acme renewal",
      stage: "Negotiation",
      amount: "1",
      close_date: "",
      owner: "",
    },
  ],
  notes: [],
  text: "Contact: Jane Doe",
};

beforeEach(() => {
  resetCall();
  cloud.cloudApi.mockImplementation(() => new Promise(() => {}));
  mockCloud = {
    status: "signed_in",
    me: { user: { id: "u", role: "agent" }, features: { zoho: { state: "available" } } },
  };
});

describe("ActionCard", () => {
  it("sends nothing until approved, and a retry reuses the same idempotency key", async () => {
    const perform = jest
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValue({ ok: true, id: "1" });
    await wrap(
      <ActionCard
        kind="lead"
        title="Create a lead"
        specs={[{ name: "last_name", label: "actions.field.last_name" }]}
        initial={{ last_name: "Doe" }}
        build={(v) => ({ last_name: v.last_name ?? "", company: "X" })}
        perform={perform}
      />,
    );
    expect(perform).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId("action-lead-approve"));
    await waitFor(() => expect(screen.getByText("Not saved. Try again.")).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId("action-lead-approve"));
    await waitFor(() => expect(screen.getByText("Saved to Zoho.")).toBeOnTheScreen());
    expect(perform).toHaveBeenCalledTimes(2);
    expect(perform.mock.calls[0]?.[2]).toBe(perform.mock.calls[1]?.[2]);
    expect(perform.mock.calls[0]?.[1]).toEqual({ last_name: "Doe", company: "X" });
    expect(screen.queryByTestId("action-lead-approve")).toBeNull(); // saved: no second write
  });

  it("an unconfirmed write is not retried from the card", async () => {
    const perform = jest.fn().mockRejectedValue(new cloud.CloudError(409, "zoho_unknown", "x"));
    await wrap(
      <ActionCard
        kind="deal_note"
        title="Note"
        specs={[]}
        initial={{}}
        build={() => ({ deal_id: "4150868000000400001", content: "x" })}
        perform={perform}
      />,
    );
    await fireEvent.press(screen.getByTestId("action-deal_note-approve"));
    await waitFor(() =>
      expect(
        screen.getByText("Zoho did not confirm. Check Zoho before trying again."),
      ).toBeOnTheScreen(),
    );
    expect(screen.queryByTestId("action-deal_note-approve")).toBeNull();
  });

  it("dismiss sends nothing", async () => {
    const perform = jest.fn();
    await wrap(
      <ActionCard
        kind="lead"
        title="Create a lead"
        specs={[]}
        initial={{}}
        build={() => ({})}
        perform={perform}
      />,
    );
    await fireEvent.press(screen.getByTestId("action-lead-dismiss"));
    expect(screen.getByTestId("action-lead-dismissed")).toBeOnTheScreen();
    expect(perform).not.toHaveBeenCalled();
  });

  it("turns a local time into ISO with the device's offset", () => {
    const iso = localToIso("2026-11-14 10:30");
    expect(iso).toMatch(/^2026-11-14T10:30:00[+-]\d{2}:\d{2}$/);
    expect(localToIso("tomorrow")).toBeNull();
    expect(localToIso("2026-02-30 10:00")).toBeNull();
  });
});

describe("PostCallPanel", () => {
  it("offers one card per action for the attached contact, plus the follow-up slot", async () => {
    attachBrief(BRIEF);
    const perform = jest.fn().mockResolvedValue({ ok: true, id: "1" });
    await wrap(<PostCallPanel perform={perform} />);
    for (const id of [
      "action-meeting",
      "action-contact_update",
      "action-deal_note",
      "actions-slot",
    ])
      expect(screen.getByTestId(id)).toBeOnTheScreen();
    expect(screen.queryByTestId("action-lead")).toBeNull();
    expect(perform).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId("action-deal_note-approve"));
    await waitFor(() => expect(perform).toHaveBeenCalledTimes(1));
    const [kind, fields] = perform.mock.calls[0] as [string, Record<string, string>];
    expect(kind).toBe("deal_note");
    expect(Object.keys(fields).sort()).toEqual(["deal_id"]); // no stage, no amount
  });

  it("offers a lead when nothing is attached, and says to connect without Zoho", async () => {
    await wrap(<PostCallPanel />);
    expect(screen.getByTestId("action-lead")).toBeOnTheScreen();
    mockCloud = {
      status: "signed_in",
      me: {
        user: { id: "u", role: "agent" },
        features: { zoho: { state: "needs_connection", cause: "zoho" } },
      },
    };
    await wrap(<PostCallPanel />);
    expect(screen.getByTestId("actions-no-zoho")).toBeOnTheScreen();
  });

  it("during the call: collapsed, then only a lead or a contact update", async () => {
    attachBrief(BRIEF);
    await wrap(<QuickActions perform={jest.fn()} />);
    expect(screen.queryByTestId("action-contact_update")).toBeNull();
    await fireEvent.press(screen.getByTestId("quick-actions-toggle"));
    expect(screen.getByTestId("action-contact_update")).toBeOnTheScreen();
    expect(screen.queryByTestId("action-meeting")).toBeNull();
    expect(screen.queryByTestId("action-deal_note")).toBeNull();
  });
});

describe("connect confirmation", () => {
  function Screen() {
    const zoho = useZoho({ open: () => {} });
    return <ZohoConnect zoho={zoho} />;
  }

  it("re-reads the status when the window regains focus and confirms the connection", async () => {
    let connected = false;
    cloud.cloudApi.mockImplementation((path: string) => {
      if (path.startsWith("/api/v1/zoho/status"))
        return Promise.resolve({
          connected,
          feature: connected
            ? { state: "available" }
            : { state: "needs_connection", cause: "zoho" },
          client: "org",
          ...(connected ? { connected_at: 1, needs_reconnect: false } : {}),
        });
      return new Promise(() => {});
    });
    const listeners: Record<string, () => void> = {};
    const g = globalThis as unknown as Record<string, unknown>;
    g.addEventListener = (t: string, f: () => void) => {
      listeners[t] = f;
    };
    g.removeEventListener = () => {};
    await wrap(<Screen />);
    await waitFor(() => expect(screen.getByTestId("zoho-connect")).toBeOnTheScreen());
    connected = true; // the person finished in the browser
    await act(async () => listeners.focus?.());
    await waitFor(() => expect(screen.getByTestId("zoho-just-connected")).toBeOnTheScreen());
    expect(cloud.refreshFeatures).toHaveBeenCalled();
    delete g.addEventListener;
    delete g.removeEventListener;
  });
});
