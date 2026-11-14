/** Follow-up plans (INT-08, INT-09, INT-10; R12, D-055, D-070): the agent sets the plan once, a
 * due step is announced on the desktop and opens its draft, and it is sent only by the agent's tap
 * with the step's own idempotency key. Meeting reminders only when the org turned them on. */
import { UIProvider } from "@sotto/ui";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { DAY_MS, planSteps } from "../features/followup/api";
import { DueSteps } from "../features/followup/DueSteps";
import { announce, noticeFor, resetAnnounced } from "../features/followup/notices";
import { PlanSetup, PlanStatus } from "../features/followup/PlanSetup";
import { FOLLOWUP_TEXT, followupText } from "../features/followup/strings";
import type { Locale } from "../lib/i18n";
import { LocaleProvider } from "../lib/locale";

let mockCloud: unknown = { status: "off" };
jest.mock("../lib/useCloud", () => ({ useCloud: () => mockCloud }));
type Call = { path: string; method: string; body: unknown };
const mockCalls: Call[] = [];
let mockRoutes: Record<string, (body: unknown) => unknown> = {};
jest.mock("../lib/cloud", () => {
  class CloudError extends Error {}
  return {
    CloudError,
    refreshFeatures: jest.fn(),
    cloudApi: jest.fn(async (path: string, init: { method?: string; body?: unknown } = {}) => {
      const method = init.method ?? "GET";
      const clean = path.split("?")[0] ?? path;
      mockCalls.push({ path: clean, method, body: init.body });
      const fn = mockRoutes[`${method} ${clean}`];
      if (!fn) throw new CloudError(`no mock for ${method} ${clean}`);
      return fn(init.body);
    }),
  };
});
let mockStep: string | undefined;
jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: () => ({ step: mockStep }),
  useRouter: () => ({ push: jest.fn() }),
}));

const wrap = (node: React.ReactNode, locale: Locale = "en") =>
  render(
    <LocaleProvider initial={locale}>
      <UIProvider direction={locale === "ar" ? "rtl" : "ltr"}>{node}</UIProvider>
    </LocaleProvider>,
  );
const signedIn = (features: Record<string, unknown> = {}) => {
  mockCloud = { status: "signed_in", me: { user: { id: "u", role: "agent" }, features } };
};
const posts = (path: string) => mockCalls.filter((c) => c.path === path && c.method === "POST");
const SENDS = ["/api/v1/email/send", "/api/v1/whatsapp/send"];
const UTILITY = {
  name: "meeting_followup",
  language: "en",
  category: "UTILITY",
  status: "APPROVED",
  body: "Thanks {{name}}.",
  params: [{ name: "name", component: "body", type: "text", example: "Jane" }],
};
const STEP_ID = "0123456789abcdef";
const PLAN = {
  id: "p1",
  call_id: "call-1",
  customer_name: "Jane Doe",
  status: "active",
  created_at: 0,
  steps: [
    {
      id: STEP_ID,
      plan_id: "p1",
      position: 0,
      kind: "whatsapp",
      due_at: Date.now() + 2 * DAY_MS,
      state: "pending",
      idempotency_key: `fu-${STEP_ID}`,
    },
  ],
};

beforeEach(() => {
  mockCalls.length = 0;
  mockStep = undefined;
  resetAnnounced();
  mockRoutes = {
    "GET /api/v1/followup/plans": () => ({ plans: [] }),
    "GET /api/v1/whatsapp/templates": () => ({ templates: [UTILITY], freeform: false }),
    "POST /api/v1/followup/plans": () => PLAN,
  };
  signedIn();
});

describe("plan steps (INT-08)", () => {
  it("email today unless sent, WhatsApp in n days, a call reminder, a meeting reminder a day before", () => {
    const now = 1_000_000_000_000;
    const msg = {
      template: "t",
      language: "en",
      recipient: { name: "J", phone: "+9715" },
      values: {},
    };
    const email = {
      sender: "org",
      format: "follow_up",
      to: ["j@x.test"],
      cc: [],
      subject: "s",
      body: "b",
      customer_name: "J",
    };
    const steps = planSteps({
      now,
      email,
      emailSent: false,
      whatsapp: msg,
      waDays: 2,
      reminderDays: 5,
      meetingAt: now + 3 * DAY_MS,
      meetingReminder: msg,
    });
    expect(steps.map((s) => [s.kind, (s.due_at - now) / DAY_MS])).toEqual([
      ["email", 0],
      ["whatsapp", 2],
      ["reminder", 5],
      ["meeting_reminder", 2],
    ]);
    const later = planSteps({
      now,
      email,
      emailSent: true,
      whatsapp: null,
      waDays: 2,
      reminderDays: null,
      meetingAt: now + DAY_MS / 2, // tomorrow morning: a day-before reminder is already past
      meetingReminder: msg,
    });
    expect(later).toEqual([]);
  });
});

describe("plan setup", () => {
  it("saves the plan once and sends nothing", async () => {
    await wrap(
      <PlanSetup
        callId="call-1"
        customer={{ name: "Jane Doe", phone: "+971501234567" }}
        email={null}
        emailSent
        whatsapp={null}
        meetingAt={null}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("plan-setup")).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId("plan-wa-days")).toBeTruthy());
    expect(screen.queryByTestId("plan-meeting-reminder")).toBeNull(); // no meeting known
    await fireEvent.press(screen.getByTestId("plan-save"));
    await waitFor(() => expect(screen.getByTestId("plan-status")).toBeTruthy());
    const body = posts("/api/v1/followup/plans")[0]?.body as {
      steps: { kind: string; prepared?: { template?: string; recipient?: { phone: string } } }[];
    };
    expect(body.steps.map((s) => s.kind)).toEqual(["whatsapp", "reminder"]);
    expect(body.steps[0]?.prepared?.template).toBe("meeting_followup");
    expect(body.steps[0]?.prepared?.recipient?.phone).toBe("+971501234567");
    for (const p of SENDS) expect(posts(p)).toEqual([]);
  });

  it("offers the meeting reminder only when the org turned it on (D-070)", async () => {
    const meetingAt = Date.now() + 3 * DAY_MS;
    signedIn({ meeting_reminders: { state: "off_by_org" } });
    const props = {
      callId: "call-1",
      customer: { name: "Jane", phone: "+971501234567" },
      email: null,
      emailSent: true,
      whatsapp: null,
      meetingAt,
    };
    const first = await wrap(<PlanSetup {...props} />);
    await waitFor(() => expect(screen.getByTestId("plan-wa-days")).toBeTruthy());
    expect(screen.queryByTestId("plan-meeting-reminder")).toBeNull();
    await first.unmount();
    signedIn({ meeting_reminders: { state: "available" } });
    await wrap(<PlanSetup {...props} />);
    await waitFor(() => expect(screen.getByTestId("plan-meeting-reminder")).toBeTruthy());
    await fireEvent(screen.getByTestId("plan-meeting-reminder"), "valueChange", true);
    await fireEvent.press(screen.getByTestId("plan-save"));
    await waitFor(() => expect(posts("/api/v1/followup/plans")).toHaveLength(1));
    const body = posts("/api/v1/followup/plans")[0]?.body as {
      steps: { kind: string; due_at: number; prepared: { meeting_at?: number } }[];
    };
    const reminder = body.steps.find((s) => s.kind === "meeting_reminder");
    expect(reminder?.prepared.meeting_at).toBe(meetingAt);
    expect(reminder?.due_at).toBe(meetingAt - DAY_MS);
  });

  it("is hidden when the plan feature is off", async () => {
    signedIn({ followup_plan: { state: "off_by_org" } });
    await wrap(
      <PlanSetup
        callId="call-1"
        customer={{ name: "J", phone: "" }}
        email={null}
        emailSent={false}
        whatsapp={null}
        meetingAt={null}
      />,
    );
    expect(screen.queryByTestId("plan-setup")).toBeNull();
  });

  it("shows WhatsApp delivery status and lets the agent pause and cancel (INT-10)", async () => {
    signedIn({ whatsapp_status: { state: "available" } });
    mockRoutes["GET /api/v1/whatsapp/status"] = () => ({
      status: { [`fu-${STEP_ID}`]: { status: "delivered", at: 1 } },
    });
    mockRoutes["POST /api/v1/followup/plans/p1/pause"] = () => ({ ...PLAN, status: "paused" });
    mockRoutes["POST /api/v1/followup/plans/p1/cancel"] = () => ({ ...PLAN, status: "cancelled" });
    const changes: string[] = [];
    await wrap(<PlanStatus plan={PLAN as never} onChange={(p) => changes.push(p.status)} />);
    await waitFor(() =>
      expect(screen.getByTestId("plan-step-whatsapp").props.children).toContain("Delivered"),
    );
    await fireEvent.press(screen.getByTestId("plan-pause"));
    await fireEvent.press(screen.getByTestId("plan-cancel"));
    await waitFor(() => expect(changes).toEqual(["paused", "cancelled"]));
  });

  it("speaks Arabic", async () => {
    await wrap(
      <PlanSetup
        callId="call-1"
        customer={{ name: "Jane", phone: "+971501234567" }}
        email={null}
        emailSent
        whatsapp={null}
        meetingAt={null}
      />,
      "ar",
    );
    await waitFor(() => expect(screen.getByText(FOLLOWUP_TEXT.ar["plan.title"])).toBeTruthy());
  });
});

describe("due steps (INT-08)", () => {
  const due = {
    ...PLAN.steps[0],
    state: "due",
    customer_name: "Jane Doe",
    call_id: "call-1",
  };
  const opened = {
    ...due,
    plan_status: "active",
    prepared: {
      template: "meeting_followup",
      language: "en",
      recipient: { name: "Jane Doe", phone: "+971501234567" },
      values: { name: "Jane" },
    },
  };

  it("the notification's step opens with its draft and is sent only by the agent's tap", async () => {
    mockStep = STEP_ID; // what a notification click navigates to
    mockRoutes = {
      ...mockRoutes,
      "GET /api/v1/followup/due": () => ({ steps: [due] }),
      [`GET /api/v1/followup/steps/${STEP_ID}`]: () => opened,
      "POST /api/v1/whatsapp/preview": () => ({
        template: "meeting_followup",
        language: "en",
        to: { name: "Jane Doe", phone: "+971501234567" },
        text: "Thanks Jane.",
      }),
      "POST /api/v1/whatsapp/send": () => ({ status: "sent", duplicate: false }),
      [`POST /api/v1/followup/steps/${STEP_ID}/done`]: () => ({ status: "done", duplicate: false }),
    };
    await wrap(<DueSteps />);
    await waitFor(() => expect(screen.getByTestId("whatsapp-preview")).toBeTruthy());
    expect(screen.queryByTestId(`due-open-${STEP_ID}`)).toBeNull(); // already open
    await fireEvent.press(screen.getByTestId("whatsapp-preview"));
    await waitFor(() => expect(screen.getByTestId("whatsapp-confirm")).toBeTruthy());
    expect(posts("/api/v1/whatsapp/send")).toEqual([]); // nothing before the tap
    await fireEvent.press(screen.getByTestId("whatsapp-confirm"));
    await waitFor(() => expect(posts(`/api/v1/followup/steps/${STEP_ID}/done`)).toHaveLength(1));
    const body = posts("/api/v1/whatsapp/send")[0]?.body as Record<string, unknown>;
    expect(body.idempotency_key).toBe(`fu-${STEP_ID}`);
    expect(body.confirm).toBe(true);
  });

  it("a call reminder is done by its own tap; skip works too", async () => {
    const reminder = { ...due, kind: "reminder" };
    mockRoutes = {
      ...mockRoutes,
      "GET /api/v1/followup/due": () => ({ steps: [reminder] }),
      [`GET /api/v1/followup/steps/${STEP_ID}`]: () => ({ ...reminder, plan_status: "active" }),
      [`POST /api/v1/followup/steps/${STEP_ID}/done`]: () => ({ status: "done" }),
    };
    await wrap(<DueSteps />);
    await waitFor(() => expect(screen.getByTestId(`due-open-${STEP_ID}`)).toBeTruthy());
    await fireEvent.press(screen.getByTestId(`due-open-${STEP_ID}`));
    await waitFor(() => expect(screen.getByTestId("step-reminder")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("step-done"));
    await waitFor(() => expect(posts(`/api/v1/followup/steps/${STEP_ID}/done`)).toHaveLength(1));
    for (const p of SENDS) expect(posts(p)).toEqual([]);
  });
});

describe("desktop notices (INT-08)", () => {
  const due = { ...PLAN.steps[0], state: "due" as const, customer_name: "Jane", call_id: "c" };
  afterEach(() => {
    (globalThis as { sottoDesktop?: unknown }).sottoDesktop = undefined;
  });

  it("each due step is announced once, with only its id and two short lines", async () => {
    const shown: unknown[] = [];
    (globalThis as { sottoDesktop?: unknown }).sottoDesktop = {
      notify: async (n: unknown) => {
        shown.push(n);
        return true;
      },
    };
    const t = followupText("en");
    await act(async () => {
      expect(await announce([due as never], t)).toBe(1);
      expect(await announce([due as never], t)).toBe(0);
    });
    expect(shown).toEqual([
      {
        stepId: STEP_ID,
        title: "Follow-up due: WhatsApp for Jane",
        body: "Open it to check and send.",
      },
    ]);
    expect(noticeFor(due as never, followupText("ar")).title).toContain("Jane");
  });

  it("without the desktop app nothing is announced", async () => {
    expect(await announce([due as never], followupText("en"))).toBe(0);
  });
});
