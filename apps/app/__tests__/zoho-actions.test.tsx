/** Post-call and during-call Zoho actions (R12, T-061, T-062) and the connect confirmation:
 * nothing is written before its own approval, a retry reuses the card's key, and the screen
 * notices a finished connect when the window comes back to the front. */
import { UIProvider } from "@sotto/ui";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ActionCard, localToIso } from "../features/actions/ActionCard";
import { AfterCallChecklist } from "../features/actions/AfterCallChecklist";
import {
  callLogSummary,
  dealNoteLabel,
  deviceTimeZone,
  zohoWebUrl,
} from "../features/actions/checklist";
import { QuickActions } from "../features/actions/PostCallPanel";
import { actionsText } from "../features/actions/strings";
import { EndedView } from "../features/call/components/EndedView";
import type { Brief } from "../features/crm/api";
import { attachBrief, resetCall, setPrep } from "../features/crm/attached";
import { useZoho } from "../features/crm/useZoho";
import { ZohoConnect } from "../features/crm/ZohoConnect";
import { saveDeviceCall, setDeviceReview } from "../lib/deviceHistory";
import { LocaleProvider } from "../lib/locale";

jest.mock("@sotto/engine", () => ({
  ...jest.requireActual("@sotto/engine"),
  buildRuntime: () => ({ router: {}, company: {} }),
  draftFollowUp: jest.fn(async () => ({ subject: "Your demo", body: "Thanks for today." })),
}));

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
  return {
    CloudError,
    cloudApi: jest.fn(() => new Promise(() => {})),
    refreshFeatures: jest.fn(),
    saveCallLog: jest.fn(),
  };
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

const REVIEW = {
  scores: { opening: 7, discovery: 6, listening: 8, objections: 5, clarity: 7, next_step: 6 },
  success: 70,
  sentiment: "positive" as const,
  summary: "Asked about the renewal price; agreed to a demo.",
  tip: "Ask about budget early.",
  strengths: [],
  improve: [],
  objections: ["price"],
  commitments: ["send the proposal"],
  next_step: { text: "Demo with the CFO", date: "2026-11-20", time: "15:30" },
  risks: [{ reason: "Budget not confirmed", quote: "no budget yet" }],
};

const checked = (id: string) =>
  screen.getByTestId(`after-${id}-check`).props.accessibilityState?.checked === true;

describe("AfterCallChecklist (UX-04, D-044)", () => {
  it("lists the suggested updates with nothing ticked and nothing sent", async () => {
    attachBrief(BRIEF);
    const perform = jest.fn();
    const saveLog = jest.fn();
    await wrap(
      <AfterCallChecklist callId="c1" review={REVIEW} perform={perform} saveLog={saveLog} />,
    );
    expect(screen.getByText("Suggested updates (3)")).toBeOnTheScreen();
    for (const id of ["call_log", "meeting", "contact_update"]) expect(checked(id)).toBe(false);
    expect(screen.queryByTestId("after-deal_note")).toBeNull(); // no prep notes: no second note
    expect(screen.queryByTestId("after-lead")).toBeNull(); // a Contact is attached
    expect(screen.getByTestId("after-save").props.accessibilityState?.disabled).toBe(true);
    expect(perform).not.toHaveBeenCalled();
    expect(saveLog).not.toHaveBeenCalled();
  });

  it("'Save 2 to Zoho' sends exactly the 2 ticked rows, each once with its own key; a retry writes nothing twice", async () => {
    attachBrief(BRIEF);
    const perform = jest
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValue({ ok: true, id: "4150868000000500001" });
    const saveLog = jest.fn().mockResolvedValue({ ok: true, id: "n1" });
    await wrap(
      <AfterCallChecklist callId="c1" review={REVIEW} perform={perform} saveLog={saveLog} />,
    );
    await fireEvent.press(screen.getByTestId("after-call_log-check"));
    await fireEvent.press(screen.getByTestId("after-contact_update-edit-toggle"));
    await fireEvent.changeText(screen.getByTestId("after-contact_update-description"), "VIP");
    await fireEvent.press(screen.getByTestId("after-contact_update-check"));
    expect(screen.getByText("Save 2 to Zoho")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("after-save"));
    await waitFor(() => expect(saveLog).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(perform).toHaveBeenCalledTimes(1));
    expect(perform.mock.calls[0]?.[0]).toBe("contact_update");
    expect(perform.mock.calls[0]?.[1]).toEqual({
      contact_id: BRIEF.person?.id,
      description: "VIP",
    });
    const log = saveLog.mock.calls[0]?.[0] as Record<string, string>;
    expect(log).toMatchObject({
      call_id: "c1",
      deal_id: "4150868000000400001",
      objections: "price",
      commitments: "send the proposal",
      next_step: "Demo with the CFO",
      chance_band: "high",
    });
    expect(JSON.stringify(log)).not.toContain("no budget yet"); // never transcript words
    // The contact write failed: Save 1 retries only it, with the same key.
    await waitFor(() => expect(screen.getByText("Save 1 to Zoho")).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId("after-save"));
    await waitFor(() => expect(perform).toHaveBeenCalledTimes(2));
    expect(perform.mock.calls[1]?.[2]).toBe(perform.mock.calls[0]?.[2]);
    expect(saveLog).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByTestId("after-contact_update-status")).toHaveTextContent("Saved"),
    );
    expect(screen.getByTestId("after-call_log-status")).toHaveTextContent("Saved");
  });

  it("shows the done state once every row is saved or skipped", async () => {
    jest.useFakeTimers();
    try {
      attachBrief(BRIEF);
      const saveLog = jest.fn().mockResolvedValue({ ok: true, id: "n1" });
      const onOpen = jest.fn();
      await wrap(
        <AfterCallChecklist
          callId="c1"
          review={REVIEW}
          perform={jest.fn()}
          saveLog={saveLog}
          onOpenChange={onOpen}
        />,
      );
      await fireEvent.press(screen.getByTestId("after-call_log-check"));
      await fireEvent.press(screen.getByTestId("after-save"));
      await fireEvent.press(screen.getByTestId("after-meeting-skip"));
      await fireEvent.press(screen.getByTestId("after-contact_update-skip"));
      await act(() => jest.advanceTimersByTime(5000));
      expect(screen.getByTestId("after-done")).toHaveTextContent(/Saved to Zoho ✓/);
      expect(onOpen).toHaveBeenLastCalledWith(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it("the meeting row is prefilled from the agreed date and cannot be ticked until the time is confirmed", async () => {
    attachBrief(BRIEF);
    await wrap(<AfterCallChecklist callId="c1" review={REVIEW} perform={jest.fn()} />);
    expect(screen.getByText("Meeting: 2026-11-20 15:30")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("after-meeting-check"));
    expect(checked("meeting")).toBe(false);
    expect(
      screen.getByText("Open Edit and confirm the date, time and time zone first"),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("after-meeting-edit-toggle"));
    await fireEvent(screen.getByTestId("after-meeting-confirm"), "valueChange", true);
    await fireEvent.press(screen.getByTestId("after-meeting-check"));
    expect(checked("meeting")).toBe(true);
    // Changing the time asks for a fresh confirmation and unticks the row.
    await fireEvent.changeText(screen.getByTestId("after-meeting-time"), "16:00");
    expect(checked("meeting")).toBe(false);
    expect(
      screen.getByText(`I checked the date, time and time zone (${deviceTimeZone()})`),
    ).toBeOnTheScreen();
  });

  it("previews the call-log note; risk signals are offered, reasons only, labelled AI-estimated", async () => {
    attachBrief(BRIEF);
    await wrap(<AfterCallChecklist callId="c1" review={REVIEW} perform={jest.fn()} />);
    await fireEvent.press(screen.getByTestId("after-call_log-edit-toggle"));
    const text = () => screen.getByTestId("after-call_log-preview-text").props.children as string;
    expect(text()).toContain("Summary: Asked about the renewal price");
    expect(text()).toContain("Chance: high");
    expect(text()).not.toContain("Risk signals");
    await fireEvent(screen.getByTestId("after-call_log-risks"), "valueChange", true);
    expect(text()).toContain("Risk signals (AI-estimated): Budget not confirmed");
    expect(text()).not.toContain("no budget yet");
  });

  it("Skip hides a row with a 5 s Undo; Undo restores it, otherwise it stays skipped", async () => {
    jest.useFakeTimers();
    try {
      attachBrief(BRIEF);
      const onOpen = jest.fn();
      await wrap(
        <AfterCallChecklist
          callId="c1"
          review={REVIEW}
          perform={jest.fn()}
          onOpenChange={onOpen}
        />,
      );
      await fireEvent.press(screen.getByTestId("after-meeting-skip"));
      expect(screen.queryByTestId("after-meeting")).toBeNull();
      await fireEvent.press(screen.getByTestId("after-skip-toast-action"));
      expect(screen.getByTestId("after-meeting")).toBeOnTheScreen();
      await fireEvent.press(screen.getByTestId("after-meeting-skip"));
      await act(() => jest.advanceTimersByTime(5000));
      expect(screen.queryByTestId("after-skip-toast")).toBeNull();
      expect(screen.queryByTestId("after-meeting")).toBeNull();
      expect(onOpen).toHaveBeenLastCalledWith(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("offers a lead when nothing is attached, and says to connect without Zoho", async () => {
    await wrap(<AfterCallChecklist callId="c1" review={null} perform={jest.fn()} />);
    expect(screen.getByTestId("after-lead")).toBeOnTheScreen();
    expect(screen.queryByTestId("after-call_log")).toBeNull(); // nothing to attach the log to
  });

  it("offers the deal note only with prep notes, headed 'Note on <deal>' in an LTR run (UX-41)", async () => {
    attachBrief(BRIEF);
    setPrep("objective", "Close the renewal");
    await wrap(<AfterCallChecklist callId="c1" review={REVIEW} perform={jest.fn()} />);
    expect(screen.getByText("Note on \u2066Acme renewal\u2069")).toBeOnTheScreen();
    const ar = dealNoteLabel(actionsText("ar"), "Acme renewal");
    expect(ar).toBe("ملاحظة على \u2066Acme renewal\u2069");
    expect(ar).not.toMatch(/Deal:|الصفقة:/);
  });

  it("folds the agent's note into the summary and links the saved record in Zoho", () => {
    expect(callLogSummary("Agreed a demo.", " Call back Tue ", null)).toBe(
      "Agreed a demo.\nAgent note: Call back Tue",
    );
    expect(callLogSummary("x".repeat(900), "", null)).toHaveLength(800);
    expect(zohoWebUrl("https://www.zohoapis.eu", "Deals", "4150868000000400001")).toBe(
      "https://crm.zoho.eu/crm/tab/Deals/4150868000000400001",
    );
    expect(zohoWebUrl("https://evil.test", "Deals", "4150868000000400001")).toBeNull();
    expect(zohoWebUrl("https://www.zohoapis.com", "Deals", "../x")).toBeNull();
  });
});

describe("EndedView (UX-04, UX-24)", () => {
  it("orders review line → checklist → follow-up → done; 'Start another call' is primary only when all are handled", async () => {
    jest.useFakeTimers();
    try {
      attachBrief(BRIEF);
      saveDeviceCall({
        id: "e1",
        started_at: 1,
        ended_at: 2,
        title: "Jane",
        mode: "live",
        cards: 2,
        p50_ms: null,
        p95_ms: null,
        transcript: [{ kind: "line", speaker: "customer", text: "Send the demo.", at_ms: 1 }],
      });
      setDeviceReview("e1", REVIEW);
      mockCloud = {
        status: "signed_in",
        bundle: { prompts: { followup: { key: "followup", body: "x" } } },
        me: {
          user: { id: "u", role: "agent" },
          features: { zoho: { state: "available" }, email_send: { state: "needs_connection" } },
        },
      };
      await wrap(
        <EndedView
          cardCount={2}
          practice={false}
          mock={false}
          callId="e1"
          perform={jest.fn()}
          onAgain={jest.fn()}
        />,
      );
      await act(async () => {});
      const tree = JSON.stringify(screen.toJSON());
      const at = (id: string) => tree.indexOf(`"${id}"`);
      expect(at("review-line")).toBeGreaterThan(-1);
      expect(at("review-line")).toBeLessThan(at("after-checklist"));
      expect(at("after-checklist")).toBeLessThan(at("followup"));
      expect(at("followup")).toBeLessThan(at("after-again-secondary"));
      expect(screen.queryByTestId("after-all-done")).toBeNull();
      for (const id of [
        "after-call_log-skip",
        "after-meeting-skip",
        "after-contact_update-skip",
        "followup-skip",
      ])
        await fireEvent.press(screen.getByTestId(id));
      await act(() => jest.advanceTimersByTime(5000));
      expect(screen.getByTestId("after-again-primary")).toBeOnTheScreen();
      expect(screen.getByTestId("after-all-done")).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("QuickActions", () => {
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
