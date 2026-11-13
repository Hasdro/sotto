/** Home (UX-10, UX-25, UX-26, UX-43b): role-based first-run steps, the agent's own view, the
 * company line for admins and managers, neutral stat tiles and the "Next: … at …" title. */
import { UIProvider } from "@sotto/ui";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
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
jest.mock("../lib/deviceHistory", () => ({ deviceCalls: () => mockCalls }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (h: string) => mockPush(h) },
  useRouter: () => ({ push: (h: string) => mockPush(h), navigate: (h: string) => mockPush(h) }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const FEATURES = {
  zoho: { state: "needs_connection", cause: "zoho" },
  email_send: { state: "needs_connection", cause: "smtp" },
  whatsapp: { state: "needs_connection", cause: "gallabox" },
};

function signedIn(
  role: ViewRole,
  extra: { playbook?: number; seats?: number; features?: object } = {},
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
    },
  };
}

const wrap = (role: ViewRole, locale: "en" | "ar" = "en") =>
  render(
    <LocaleProvider initial={locale}>
      <RoleProvider initial={role}>
        <UIProvider direction={locale === "ar" ? "rtl" : "ltr"}>
          <HomeScreen />
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
  it("agent sees Connect Zoho and Test audio, and no practice step (owner Q15)", async () => {
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
      markedDone: [],
    };
    expect(setupFor(facts).pending).toEqual([]);
    const practice = {
      id: "practice",
      roles: ["agent" as const],
      label: "setup.audio" as const,
      href: "/call",
      done: () => false,
    };
    expect(setupFor(facts, [...SETUP_STEPS, practice]).pending.map((s) => s.id)).toEqual([
      "practice",
    ]);
  });
});

describe("agent and staff Home (UX-25, D-050)", () => {
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

  it("names the next meeting with a formatted time in English and Arabic", () => {
    const iso = (s: string) => `\u2068${s}\u2069`;
    expect(nextLine(tt("en"), "en", meeting)).toBe(`Next: ${iso("Acme renewal call")} at 13:30`);
    expect(nextLine(tt("ar"), "ar", meeting)).toBe(
      `التالي: ${iso("Acme renewal call")} الساعة 01:30 م`,
    );
  });

  it("says it is ready when there is no meeting, instead of a greeting", async () => {
    signedIn("agent");
    await wrap("agent");
    expect(screen.getByTestId("home-next")).toHaveTextContent("Ready for your next call");
    expect(allText()).not.toMatch(/Good (morning|afternoon|evening)/);
  });
});
