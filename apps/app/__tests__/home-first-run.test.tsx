/** Home (UX-10, UX-25, UX-26, UX-43b): role-based first-run steps, the agent's own view, the
 * company line for admins and managers, neutral stat tiles and the "Next: … at …" title. */
import { UIProvider } from "@sotto/ui";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as ReactNative from "react-native";
import type { MeetingCandidate } from "../features/crm/api";
import { HomeScreen, nextLine } from "../features/home/HomeScreen";
import { SETUP_STEPS, setupFor } from "../features/home/setup";
import { t } from "../lib/i18n";
import { LocaleProvider } from "../lib/locale";
import { DEFAULT_PREFS, setPrefs } from "../lib/prefs";
import { RoleProvider, type ViewRole } from "../lib/role";

let mockCloud: unknown = { status: "off" };
jest.mock("../lib/useCloud", () => ({ useCloud: () => mockCloud }));
jest.mock("../lib/cloud", () => ({
  CloudError: class extends Error {},
  cloudApi: jest.fn(() => new Promise(() => {})),
  cloudOrigin: () => "https://sales.example.com",
  refreshFeatures: jest.fn(),
}));
let mockZoho: { connected: boolean } | null = { connected: false };
jest.mock("../features/crm/useZoho", () => ({
  useZoho: () => ({ status: mockZoho }),
  onReturn: () => () => {},
}));
let mockCalls: unknown[] = [];
jest.mock("../lib/deviceHistory", () => ({
  deviceCalls: () => mockCalls,
  allDeviceCalls: () => mockCalls,
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (h: string) => mockPush(h) },
  useRouter: () => ({ push: (h: string) => mockPush(h), navigate: (h: string) => mockPush(h) }),
  Link: ({ children }: { children: React.ReactNode }) => children,
  useLocalSearchParams: () => ({}),
}));

const FEATURES = {
  zoho: { state: "needs_connection", cause: "zoho" },
  email_send: { state: "needs_connection", cause: "smtp" },
  whatsapp: { state: "needs_connection", cause: "gallabox" },
};

function signedIn(
  role: ViewRole,
  extra: { playbook?: number; seats?: number; features?: object; practice?: boolean } = {},
) {
  mockCloud = {
    status: "signed_in",
    me: {
      user: { id: "u1", name: "Sara Khalil", email: "sara@acme.test", role },
      company: {
        name: "Acme",
        status: "trial",
        days_left: 9,
        seats_used: extra.seats ?? 1,
        seats: 5,
        minutes_used: 40,
        minutes_month: 300,
        can_call: true,
        blocked_reason: null,
      },
      features: extra.features ?? FEATURES,
    },
    bundle: {
      playbook: Array.from({ length: extra.playbook ?? 0 }, (_, i) => ({ id: `p${i}` })),
      stages: { suggest: { provider: "anthropic", model: "claude-test-model" } },
      providers: { anthropic: { name: "Anthropic", key_env: "K" } },
      stage_slots: {},
      scenarios: [],
      ...(extra.practice
        ? {
            practice: {
              id: "practice",
              title: "Practice call",
              lines: [{ speaker: "customer", text: "Hi", gap_ms: 0, duration_ms: 1 }],
            },
          }
        : {}),
    },
  };
}

const wrap = (role: ViewRole, locale: "en" | "ar" = "en", today?: React.ReactNode) =>
  render(
    <LocaleProvider initial={locale}>
      <RoleProvider initial={role}>
        <UIProvider direction={locale === "ar" ? "rtl" : "ltr"}>
          <HomeScreen today={today} />
        </UIProvider>
      </RoleProvider>
    </LocaleProvider>,
  );

const allText = () => JSON.stringify(screen.toJSON());

beforeEach(() => {
  mockPush.mockReset();
  mockZoho = { connected: false };
  mockCalls = [];
  setPrefs({ ...DEFAULT_PREFS });
});

describe("first-run checklist (UX-10)", () => {
  it("agent sees Connect Zoho and Test audio; no practice step without the server's script", async () => {
    signedIn("agent");
    await wrap("agent");
    expect(screen.getByTestId("home-setup")).toBeOnTheScreen();
    expect(screen.getByText("Connect your Zoho CRM")).toBeOnTheScreen();
    expect(screen.getByText("Test your audio (10 seconds)")).toBeOnTheScreen();
    expect(screen.queryByText(/practice/i)).toBeNull();
    expect(screen.queryByText("Invite your team")).toBeNull();
    await fireEvent.press(screen.getByTestId("setup-audio-open"));
    expect(mockPush).toHaveBeenCalledWith("/call?check=audio");
    await fireEvent.press(screen.getByTestId("setup-zoho-open"));
    expect(mockPush).toHaveBeenCalledWith("/settings#zoho");
  });

  it("admin sees playbook, invite and email/WhatsApp; a manager only the playbook", async () => {
    signedIn("admin");
    await wrap("admin");
    for (const label of [
      "Add answers to your playbook",
      "Invite your team",
      "Connect email or WhatsApp",
    ])
      expect(screen.getByText(label)).toBeOnTheScreen();
    expect(screen.queryByText("Connect your Zoho CRM")).toBeNull();
    await fireEvent.press(screen.getByTestId("setup-messaging-open"));
    expect(mockPush).toHaveBeenCalledWith("/admin/integrations");
  });

  it.each(["agent", "manager", "admin"] as const)(
    "%s gets 'Try a practice call', which opens the practice call (D-073)",
    async (role) => {
      signedIn(role, { practice: true });
      await wrap(role);
      expect(screen.getByText("Try a practice call")).toBeOnTheScreen();
      await fireEvent.press(screen.getByTestId("setup-practice-open"));
      expect(mockPush).toHaveBeenCalledWith("/call?practice=1");
    },
  );

  it("the practice step is in Arabic too, and leaves once practised", async () => {
    signedIn("agent", { practice: true });
    await wrap("agent", "ar");
    expect(screen.getByText("جرّب مكالمة تدريبية")).toBeOnTheScreen();
    await act(async () => setPrefs({ setupDone: ["practice"] }));
    expect(screen.queryByText("جرّب مكالمة تدريبية")).toBeNull();
  });

  it("a manager sees only the playbook step", async () => {
    signedIn("manager");
    await wrap("manager");
    expect(screen.getByText("Add answers to your playbook")).toBeOnTheScreen();
    expect(screen.queryByText("Invite your team")).toBeNull();
  });

  it("a done step disappears, and the checklist hides when every step is done", async () => {
    signedIn("agent");
    mockZoho = { connected: true };
    await wrap("agent");
    expect(screen.queryByText("Connect your Zoho CRM")).toBeNull();
    expect(screen.getByText("1 of 2 done")).toBeOnTheScreen();
    await act(async () => setPrefs({ audioChecked: true }));
    expect(screen.queryByTestId("home-setup")).toBeNull();
  });

  it("ticking a step marks it done by hand", async () => {
    signedIn("admin", { playbook: 4, seats: 3 });
    await wrap("admin");
    expect(screen.queryByText("Invite your team")).toBeNull();
    await fireEvent.press(screen.getByTestId("setup-messaging-check"));
    await waitFor(() => expect(screen.queryByTestId("home-setup")).toBeNull());
  });

  it("is data-driven: a new step is one entry", () => {
    const facts = {
      role: "agent" as const,
      zohoConnected: true,
      zohoOffered: true,
      audioChecked: true,
      playbookEntries: 0,
      seatsUsed: 1,
      messagingConnected: false,
      practiceOffered: false,
      markedDone: [],
    };
    expect(setupFor(facts).pending).toEqual([]);
    const extra = {
      id: "extra",
      roles: ["agent" as const],
      label: "setup.audio" as const,
      href: "/call",
      done: () => false,
    };
    expect(setupFor(facts, [...SETUP_STEPS, extra]).pending.map((s) => s.id)).toEqual(["extra"]);
  });
});

describe("agent and staff Home (UX-25, draft D-050 (backlog))", () => {
  it("an agent sees no company block and no model name, but their own questions", async () => {
    signedIn("agent");
    mockCalls = [
      {
        id: "c1",
        started_at: Date.now() - 60_000,
        ended_at: Date.now(),
        title: "Acme",
        cards: 2,
        p95_ms: 900,
        transcript: [{ kind: "escalation", text: "Do you integrate with SAP?", at_ms: 1 }],
        review: { tip: "Ask about the budget earlier." },
      },
    ];
    await wrap("agent");
    expect(screen.queryByTestId("home-company")).toBeNull();
    expect(screen.queryByTestId("home-playbook")).toBeNull();
    const text = allText();
    expect(text).not.toMatch(/claude|anthropic|model|seats/i);
    expect(screen.getByText("Do you integrate with SAP?")).toBeOnTheScreen();
    expect(screen.getByTestId("home-last-tip")).toBeOnTheScreen();
    expect(screen.getByText("Ask about the budget earlier.")).toBeOnTheScreen();
  });

  it.each(["admin", "manager"] as const)(
    "%s sees the company block with trial and seats on one line",
    async (role) => {
      signedIn(role);
      await wrap(role);
      expect(screen.getByTestId("home-company")).toBeOnTheScreen();
      expect(screen.getByTestId("home-status")).toHaveTextContent(
        "Free trial · 9 days left · 1 of 5 seats",
      );
      expect(allText()).not.toMatch(/claude-test-model/);
    },
  );

  it("stat tiles are the neutral StatTile (UX-26)", async () => {
    signedIn("agent");
    await wrap("agent");
    for (const id of ["calls", "minutes", "cards", "speed"])
      expect(screen.getByTestId(`home-stat-${id}`)).toBeOnTheScreen();
  });
});

/** testIDs in document order. */
function order(): string[] {
  const ids: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (!node || typeof node !== "object") return;
    const n = node as { props?: { testID?: string }; children?: unknown[] | null };
    if (n.props?.testID) ids.push(n.props.testID);
    for (const child of n.children ?? []) walk(child);
  };
  walk(screen.toJSON());
  return ids;
}

describe("today's orientation comes before old calls (UX-003)", () => {
  const today = <ReactNative.View testID="today-slot" />;

  it("on a narrow window it sits right under the numbers, above meetings and recent calls", async () => {
    signedIn("admin");
    await wrap("admin", "en", today);
    const ids = order();
    expect(ids.indexOf("today-slot")).toBeGreaterThan(ids.indexOf("home-stat-speed"));
    expect(ids.indexOf("today-slot")).toBeLessThan(ids.indexOf("home-recent"));
  });

  it("on a wide window it heads the side column, above the company and playbook cards", async () => {
    jest
      .spyOn(ReactNative.Dimensions, "get")
      .mockReturnValue({ width: 1280, height: 800, scale: 1, fontScale: 1 });
    signedIn("admin");
    await wrap("admin", "en", today);
    const ids = order();
    expect(ids.indexOf("today-slot")).toBeGreaterThan(ids.indexOf("home-recent"));
    expect(ids.indexOf("today-slot")).toBeLessThan(ids.indexOf("home-company"));
    expect(ids.indexOf("home-company")).toBeLessThan(ids.indexOf("home-playbook"));
    jest.restoreAllMocks();
  });
});

describe("numbers and summary links", () => {
  const STATS = ["calls", "minutes", "cards", "speed"];

  it("the four numbers form an even 2×2 grid below the wide layout, never 3 + 1 (UI-003)", async () => {
    signedIn("admin");
    await wrap("admin");
    for (const id of STATS)
      expect(screen.getByTestId(`home-stat-${id}`)).toHaveStyle({ flexBasis: "40%" });
  });

  it("and one even row of four on a wide window (UI-003)", async () => {
    jest
      .spyOn(ReactNative.Dimensions, "get")
      .mockReturnValue({ width: 1280, height: 800, scale: 1, fontScale: 1 });
    signedIn("admin");
    await wrap("admin");
    for (const id of STATS)
      expect(screen.getByTestId(`home-stat-${id}`)).toHaveStyle({ flexBasis: 0 });
    jest.restoreAllMocks();
  });

  it("the Playbook card's rows are links with a chevron that points the reading way (UI-004)", async () => {
    signedIn("admin", { playbook: 9 });
    await wrap("admin");
    for (const id of ["home-playbook-entries", "home-playbook-questions"]) {
      expect(screen.getByTestId(id)).toHaveProp("accessibilityRole", "link");
      expect(screen.getByTestId(`${id}-chevron`, { includeHiddenElements: true })).toHaveStyle({
        transform: [{ rotate: "-90deg" }],
      });
    }
    expect(screen.getByTestId("home-playbook-entries")).toHaveTextContent(/9/);
  });

  it("in Arabic the chevron points left (UI-004)", async () => {
    signedIn("admin");
    await wrap("admin", "ar");
    expect(
      screen.getByTestId("home-playbook-entries-chevron", { includeHiddenElements: true }),
    ).toHaveStyle({ transform: [{ rotate: "90deg" }] });
  });
});

describe("Next: … at … (UX-43b)", () => {
  const meeting = {
    id: "m1",
    title: "Acme renewal call",
    start: "2026-11-14T09:30:00Z",
    end: "2026-11-14T10:00:00Z",
  } as MeetingCandidate;
  const tt =
    (locale: "en" | "ar") => (key: Parameters<typeof t>[0], vars?: Parameters<typeof t>[2]) =>
      t(key, locale, vars);

  const iso = (s: string) => `\u2068${s}\u2069`;
  // "Today" is a Dubai day, like the time in the same line (lib/format.ts).
  const sameDay = new Date("2026-11-14T05:00:00Z");

  it("names the next meeting with a formatted time in English and Arabic", () => {
    expect(nextLine(tt("en"), "en", meeting, sameDay)).toBe(
      `Next: ${iso("Acme renewal call")} at 13:30`,
    );
    expect(nextLine(tt("ar"), "ar", meeting, sameDay)).toBe(
      `التالي: ${iso("Acme renewal call")} الساعة 01:30 م`,
    );
  });

  it("says tomorrow or the weekday when the meeting is not today (UX-002)", () => {
    const friday = new Date("2026-11-27T08:00:00Z");
    const at = (start: string) => ({ ...meeting, start, end: start }) as MeetingCandidate;
    const title = iso("Acme renewal call");
    expect(nextLine(tt("en"), "en", at("2026-11-27T11:00:00Z"), friday)).toBe(
      `Next: ${title} at 15:00`,
    );
    expect(nextLine(tt("en"), "en", at("2026-11-28T07:00:00Z"), friday)).toBe(
      `Next: ${title} tomorrow at 11:00`,
    );
    expect(nextLine(tt("en"), "en", at("2026-11-30T07:00:00Z"), friday)).toBe(
      `Next: ${title} on Mon 30 Nov at 11:00`,
    );
    expect(nextLine(tt("ar"), "ar", at("2026-11-28T07:00:00Z"), friday)).toBe(
      `التالي: ${title} غدًا الساعة 11:00 ص`,
    );
    expect(nextLine(tt("ar"), "ar", at("2026-11-30T07:00:00Z"), friday)).toBe(
      `التالي: ${title} يوم الاثنين، 30 نوفمبر الساعة 11:00 ص`,
    );
  });

  it("says it is ready when there is no meeting, instead of a greeting", async () => {
    signedIn("agent");
    await wrap("agent");
    expect(screen.getByTestId("home-next")).toHaveTextContent("Ready for your next call");
    expect(allText()).not.toMatch(/Good (morning|afternoon|evening)/);
  });
});
