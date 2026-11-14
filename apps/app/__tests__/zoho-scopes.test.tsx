/**
 * W4-SCOPES (D-069): one reconnect prompt for the wave-4 scope bundle, and the new checklist
 * rows (INT-02t Task, INT-06 AGN fields) only once the connection has the scopes.
 */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SCOPES_FIX, useHealthBanner } from "../components/HealthBanner";
import { AfterCallChecklist } from "../features/actions/AfterCallChecklist";
import { buildItems, callScore, taskConfirmation, validDay } from "../features/actions/checklist";
import { ACTIONS_TEXT, actionsText } from "../features/actions/strings";
import type { Brief } from "../features/crm/api";
import { attachBrief, resetCall } from "../features/crm/attached";
import { CRM_TEXT } from "../features/crm/strings";
import type { ConfigHealth } from "../lib/cloud";
import { LocaleProvider } from "../lib/locale";

let mockHealth: ConfigHealth = { status: "ok", reasons: [] };
let mockStatus: Record<string, unknown> = {};
const ME = "4150868000000100001";
const BO = "4150868000000100002";
jest.mock("../lib/useCloud", () => ({
  useCloud: () => ({
    status: "signed_in",
    me: { user: { id: "u", role: "agent" }, features: { zoho: { state: "available" } } },
  }),
}));
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
    configHealth: () => mockHealth,
    refreshFeatures: jest.fn(async () => {}),
    saveCallLog: jest.fn(),
    cloudApi: jest.fn(async (path: string) => {
      if (path.startsWith("/api/v1/zoho/status")) return mockStatus;
      if (path === "/api/v1/zoho/owners")
        return {
          me: ME,
          owners: [
            { id: ME, name: "Ada", me: true },
            { id: BO, name: "Bo", me: false },
          ],
        };
      return new Promise(() => {});
    }),
  };
});
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (h: string) => mockPush(h) } }));

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
      amount: "12000",
      close_date: "",
      owner: "",
    },
  ],
  notes: [],
  text: "Contact: Jane Doe",
};
const REVIEW = {
  scores: { opening: 7, discovery: 6, listening: 8, objections: 5, clarity: 7, next_step: 6 },
  success: 70,
  sentiment: "positive" as const,
  summary: "Agreed to a demo.",
  tip: "",
  strengths: [],
  improve: [],
  objections: ["price"],
  commitments: ["send the proposal"],
  next_step: { text: "Send the proposal", date: "2099-11-20", time: null },
  risks: [],
};
const ALL = { tasks: true, agn_fields: true, campaigns: true, notifications: true };
const t = ((k: string) => k) as Parameters<typeof buildItems>[0]["t"];
const at = actionsText("en");
const items = (features?: { tasks?: boolean; agn_fields?: boolean }) =>
  buildItems({
    t,
    at,
    callId: "c1",
    brief: BRIEF,
    review: REVIEW,
    note: "",
    prepNotes: "",
    features,
    owners: [{ id: ME, name: "Ada", me: true }],
  });

const wrap = (node: React.ReactNode, locale: "en" | "ar" = "en") =>
  render(
    <LocaleProvider initial={locale}>
      <UIProvider direction={locale === "ar" ? "rtl" : "ltr"}>{node}</UIProvider>
    </LocaleProvider>,
  );

function Banner({ viewAs }: { viewAs: "agent" | "admin" }) {
  return <>{useHealthBanner(viewAs)}</>;
}

beforeEach(() => {
  resetCall();
  mockPush.mockReset();
  mockStatus = { connected: true, features: ALL, scopes_outdated: false };
});

describe("one reconnect for the scope bundle", () => {
  it("an agent sees one 'Reconnect Zoho' line that opens Settings › Zoho", async () => {
    mockHealth = {
      status: "needs_attention",
      reasons: [{ code: "zoho_scopes_outdated" as never, fix: "/settings#zoho" }],
    };
    await wrap(<Banner viewAs="agent" />);
    expect(screen.getAllByTestId("health-banner")).toHaveLength(1);
    expect(
      screen.getByText("Zoho needs new permissions for tasks, deal fields and campaigns."),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("health-fix"));
    expect(mockPush).toHaveBeenCalledWith(SCOPES_FIX);
  });

  it("is in Arabic too", async () => {
    mockHealth = {
      status: "needs_attention",
      reasons: [{ code: "zoho_scopes_outdated" as never, fix: "/settings#zoho" }],
    };
    await wrap(<Banner viewAs="agent" />, "ar");
    expect(screen.getByText("أعد ربط Zoho")).toBeOnTheScreen();
  });

  it("old scopes: no Task or AGN row (nothing extra to reconnect for); after: both", () => {
    const before = items(undefined).map((i) => i.id);
    expect(before).not.toContain("task");
    expect(before).not.toContain("agn_fields");
    const after = items(ALL).map((i) => i.id);
    expect(after).toContain("task");
    expect(after).toContain("agn_fields");
  });

  it("English and Arabic strings are in step", () => {
    expect(Object.keys(CRM_TEXT.ar).sort()).toEqual(Object.keys(CRM_TEXT.en).sort());
    expect(Object.keys(ACTIONS_TEXT.ar).sort()).toEqual(Object.keys(ACTIONS_TEXT.en).sort());
  });
});

describe("Task row (INT-02t)", () => {
  it("is prefilled from the review and cannot be ticked before due date and owner are confirmed", () => {
    const task = items(ALL).find((i) => i.id === "task");
    if (!task) throw new Error("no task row");
    const v = { ...task.initial };
    expect(v.subject).toBe("Send the proposal");
    expect(v.due_date).toBe("2099-11-20");
    expect(v.owner_id).toBe(ME);
    expect(task.ready(v)).toBe(false);
    const ok = { ...v, confirmed: taskConfirmation(v) };
    expect(task.ready(ok)).toBe(true);
    // A changed owner or date needs a fresh confirmation.
    expect(task.ready({ ...ok, owner_id: BO })).toBe(false);
    expect(task.ready({ ...ok, due_date: "2099-11-21" })).toBe(false);
    expect(task.build(ok)).toEqual({
      call_id: "c1",
      subject: "Send the proposal",
      due_date: "2099-11-20",
      owner_id: ME,
      description: "send the proposal",
      deal_id: "4150868000000400001",
      contact_id: "4150868000000224005",
    });
    expect(validDay("2026-02-30")).toBe(false);
  });

  it("in the checklist: confirm, tick, save once with the task kind", async () => {
    attachBrief(BRIEF);
    const perform = jest.fn().mockResolvedValue({ ok: true, id: "4150868000000600001" });
    await wrap(<AfterCallChecklist callId="c1" review={REVIEW} perform={perform} />);
    await waitFor(() => expect(screen.getByTestId("after-task")).toBeOnTheScreen());
    await waitFor(() => expect(screen.getByText(/Task due .*2099-11-20.* for .*Ada/)).toBeTruthy());
    expect(screen.getByTestId("after-task-check").props.accessibilityState?.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId("after-task-edit-toggle"));
    await fireEvent.press(screen.getByTestId(`after-task-owner-${BO}`));
    await fireEvent(screen.getByTestId("after-task-confirm"), "valueChange", true);
    expect(screen.getByTestId("after-task-check").props.accessibilityState?.disabled).toBe(false);
    await fireEvent.press(screen.getByTestId("after-task-check"));
    await fireEvent.press(screen.getByTestId("after-save"));
    await waitFor(() => expect(perform).toHaveBeenCalledTimes(1));
    expect(perform.mock.calls[0]?.[0]).toBe("task");
    expect(perform.mock.calls[0]?.[1]).toMatchObject({ owner_id: BO, due_date: "2099-11-20" });
  });
});

describe("AGN fields row (INT-06)", () => {
  it("writes only the four AGN fields, never stage or amount", () => {
    const agn = items(ALL).find((i) => i.id === "agn_fields");
    if (!agn) throw new Error("no agn row");
    const built = agn.build(agn.initial);
    expect(built).toMatchObject({
      call_id: "c1",
      deal_id: "4150868000000400001",
      score: String(callScore(REVIEW)),
      chance_band: "high",
      top_objection: "price",
    });
    expect(Object.keys(built as object).sort()).toEqual(
      ["call_id", "chance_band", "deal_id", "last_call_date", "score", "top_objection"].sort(),
    );
    expect(JSON.stringify(built)).not.toMatch(/stage|amount|12000|Negotiation/i);
    expect(agn.ready({ ...agn.initial, score: "101" })).toBe(false);
    expect(callScore(REVIEW)).toBe(65);
  });
});
