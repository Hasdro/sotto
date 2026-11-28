/**
 * Component tests for Round 4 Agent 2: PostCallWizard (<30s suppression, navigation without
 * sends, draft preservation, Finish later error handling), FeedbackStep (chips + whole-call box +
 * merge toast + role-based routing to /memory vs /admin/memory + offline queue), EndedView wiring,
 * and StyleMemoryScreen (agent personal/pending view + admin review toggle/promote).
 */
import { UIProvider } from "@sotto/ui";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import type { CardView } from "../features/cards/reducer";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

let mockRole: "admin" | "agent" = "agent";
let mockFeatures: Record<string, { state: string }> = {
  postcall_wizard: { state: "available" },
  style_memory: { state: "available" },
  call_review: { state: "available" },
  whatsapp: { state: "off_by_org" },
  email_send: { state: "off_by_org" },
  zoho: { state: "off_by_org" },
};

jest.mock("../lib/useCloud", () => ({
  useCloud: () => ({
    status: "signed_in",
    me: {
      user: {
        id: "u1",
        email: "agent@acme.test",
        name: "Agnes",
        role: mockRole,
        must_change_password: false,
      },
      company: null,
      features: mockFeatures,
    },
    bundle: null,
  }),
}));

const mockApi = jest.fn();
let mockCloudActive = true;
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
    cloudActive: () => mockCloudActive,
    cloudApi: (...args: unknown[]) => mockApi(...args),
  };
});

jest.mock("../features/review/CallReviewPanel", () => ({
  CallReviewPanel: ({ callId }: { callId: string | null }) => {
    const { Text } = require("react-native");
    return <Text testID="mock-review-panel">{`review:${callId ?? "none"}`}</Text>;
  },
}));

import { EndedView } from "../features/call/components/EndedView";
import { FeedbackStep, PostCallWizard, StyleMemoryScreen } from "../features/postcall";
import { LocaleProvider } from "../lib/locale";
import { _clearOutboxForTest, listOutbox } from "../lib/outbox";

function wrap(ui: ReactNode) {
  return (
    <LocaleProvider>
      <UIProvider direction="ltr">{ui}</UIProvider>
    </LocaleProvider>
  );
}

const aiCard: CardView = {
  id: "card-ai-1",
  callId: "call-42",
  type: "answer",
  source: "ai",
  label: null,
  text: "Mention flexible billing terms.",
  done: true,
  turnKey: "t1",
  firstSeenAt: 0,
  shownAfterMs: 320,
  timing: null,
  chunks: {},
  doneSeq: 1,
};

const playbookCard: CardView = {
  ...aiCard,
  id: "card-pb-1",
  source: "playbook",
  text: "Playbook text should never be rated.",
};

describe("Round 4 Wizard, FeedbackStep & StyleMemoryScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.mockReset().mockResolvedValue({});
    _clearOutboxForTest();
    mockRole = "agent";
    mockCloudActive = true;
    mockFeatures = {
      postcall_wizard: { state: "available" },
      style_memory: { state: "available" },
      call_review: { state: "available" },
      whatsapp: { state: "off_by_org" },
      email_send: { state: "off_by_org" },
      zoho: { state: "off_by_org" },
    };
  });

  it("EndedView suppresses wizard for calls < 30s and mounts it for calls >= 30s", async () => {
    await render(
      wrap(
        <EndedView
          cardCount={1}
          practice={false}
          mock={false}
          callId="call-short"
          durationS={12}
          cards={[aiCard]}
          onAgain={jest.fn()}
        />,
      ),
    );
    expect(screen.queryByTestId("postcall-wizard")).toBeNull();
    expect(screen.queryByTestId("mock-review-panel")).toBeNull();

    await render(
      wrap(
        <EndedView
          cardCount={1}
          practice={false}
          mock={false}
          callId="call-42"
          durationS={95}
          cards={[aiCard]}
          onAgain={jest.fn()}
        />,
      ),
    );
    expect(screen.getByTestId("postcall-wizard")).toBeTruthy();
    expect(screen.getByTestId("mock-review-panel")).toBeTruthy();
  });

  it("PostCallWizard navigates steps cleanly and handles Finish later errors", async () => {
    mockApi.mockRejectedValueOnce(new Error("offline"));
    await render(
      wrap(
        <PostCallWizard
          callId="call-42"
          durationS={120}
          cards={[aiCard]}
          whatsappSuggested={false}
          emailSuggested={false}
          zohoSuggested={false}
        />,
      ),
    );

    await fireEvent.press(screen.getByTestId("wizard-finish-later"));
    await waitFor(() =>
      expect(screen.getByTestId("wizard-saved")).toHaveTextContent(/Could not save/),
    );

    await fireEvent.press(screen.getByTestId("wizard-next"));
    expect(screen.getByTestId("wizard-feedback-step")).toBeTruthy();
    expect(screen.getByTestId("feedback-card-card-ai-1")).toBeTruthy();
    expect(screen.queryByTestId("feedback-card-card-pb-1")).toBeNull();

    await fireEvent.press(screen.getByTestId("wizard-back"));
    expect(screen.getByTestId("mock-review-panel")).toBeTruthy();
  });

  it("FeedbackStep filters non-AI cards, merges online, and routes agent toast to /memory", async () => {
    mockApi.mockImplementation(async (path: string) => {
      if (path === "/api/v1/ratings") return { ok: true };
      if (path === "/api/v1/memory/feedback") return { id: "fb-1" };
      if (path === "/api/v1/memory/merge") {
        return { version: 2, status: "applied", learned_count: 1, rules: ["Shorten"] };
      }
      return {};
    });

    await render(wrap(<FeedbackStep callId="call-42" cards={[aiCard, playbookCard]} />));

    expect(screen.queryByTestId("feedback-card-card-pb-1")).toBeNull();
    await fireEvent.press(screen.getByTestId("fb-down-card-ai-1"));
    await fireEvent.press(screen.getByTestId("fb-reason-too_long-card-ai-1"));
    await fireEvent.changeText(screen.getByTestId("feedback-call-note"), "Be shorter.");
    await fireEvent.press(screen.getByTestId("feedback-submit"));

    await waitFor(() => expect(screen.getByTestId("feedback-learned-toast")).toBeTruthy());
    await fireEvent.press(screen.getByText("Style memory"));
    expect(mockPush).toHaveBeenCalledWith("/memory");
  });

  it("FeedbackStep queues in offline outbox when server is inactive", async () => {
    mockCloudActive = false;
    await render(wrap(<FeedbackStep callId="call-off" cards={[aiCard]} />));
    await fireEvent.changeText(screen.getByTestId("feedback-call-note"), "Queue me offline.");
    await fireEvent.press(screen.getByTestId("feedback-submit"));

    await waitFor(() => expect(screen.getByTestId("feedback-status")).toHaveTextContent(/Offline/));
    expect(listOutbox().some((item) => item.kind === "memory_feedback")).toBe(true);
  });

  it("StyleMemoryScreen renders personal and pending rules for agent", async () => {
    mockApi.mockImplementation(async (path: string) => {
      if (path === "/api/v1/memory/me") {
        return {
          user_id: "u1",
          company_rules: [{ id: "c1", text: "Always confirm booking date.", enabled: true }],
          agent_rules: [{ id: "a1", text: "Keep cards disabled example.", enabled: false }],
          effective: ["Always confirm booking date."],
          pending: [
            {
              version: 2,
              status: "pending",
              origin: "merge",
              items: [{ id: "p1", text: "Stay brief.", enabled: true }],
            },
          ],
          review_before_apply: true,
          limits: { rules: 12, words: 25 },
        };
      }
      return {};
    });

    await render(wrap(<StyleMemoryScreen />));
    await waitFor(() => expect(screen.getByTestId("memory-personal-readonly")).toBeTruthy());
    expect(screen.getByTestId("memory-my-pending")).toBeTruthy();
  });

  const ME = {
    user_id: "u1",
    company_rules: [],
    agent_rules: [],
    effective: [],
    pending: [],
    review_before_apply: false,
    limits: { rules: 12, words: 25 },
  };
  const OMAR = {
    user_id: "u2",
    name: "Omar Haddad",
    email: "omar@example.test",
    role: "agent",
    active_version: 1,
    items: [{ id: "r1", text: "Open with the customer's goal.", enabled: true }],
    versions: [],
    pending: [],
    effective: ["Open with the customer's goal."],
  };
  const adminWith = (agents: unknown[]) => ({
    review_before_apply: false,
    company: { active_version: 1, items: [], versions: [], pending: [] },
    agents,
    limits: { rules: 12, words: 25 },
  });

  it("Team agents: one card per teammate; Save changes only after an edit (FUNC-008, UI-016)", async () => {
    mockRole = "admin";
    mockApi.mockImplementation(async (path: string) =>
      path === "/api/v1/memory/me" ? ME : path === "/api/v1/memory/admin" ? adminWith([OMAR]) : {},
    );
    await render(wrap(<StyleMemoryScreen />));
    await waitFor(() => expect(screen.getByTestId("memory-tabs-agents")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("memory-tabs-agents"));
    const card = await screen.findByTestId("agent-memory-u2");
    expect(screen.getAllByText("Omar Haddad")).toHaveLength(1); // the name is not repeated
    expect(card).toHaveTextContent(/Active rules: 1\/12/); // the server's limit, not a fixed 12
    expect(card).not.toHaveTextContent(/your next call/);
    const save = screen.getByTestId("agent-editor-u2-save");
    expect(save).toBeDisabled();
    await fireEvent.changeText(
      screen.getByDisplayValue("Open with the customer's goal."),
      "Ask about timing.",
    );
    expect(screen.getByTestId("agent-editor-u2-save")).not.toBeDisabled();
  });

  it("Style memory shows loading, then a clear empty state (UI-013)", async () => {
    mockRole = "admin";
    let release: (v: unknown) => void = () => {};
    mockApi.mockImplementation((path: string) =>
      path === "/api/v1/memory/admin"
        ? new Promise((r) => {
            release = r;
          })
        : Promise.resolve(ME),
    );
    await render(wrap(<StyleMemoryScreen />));
    expect(screen.getByTestId("memory-loading")).toBeTruthy();
    await act(async () => release(adminWith([])));
    await fireEvent.press(screen.getByTestId("memory-tabs-agents"));
    expect(screen.getByTestId("memory-agents-empty")).toBeTruthy();
  });

  it("StyleMemoryScreen toggles review_before_apply for admin", async () => {
    mockRole = "admin";
    const overview = {
      review_before_apply: false,
      company: { active_version: 1, items: [], versions: [], pending: [] },
      agents: [],
      limits: { rules: 12, words: 25 },
    };
    mockApi.mockImplementation(async (path: string) => {
      if (path === "/api/v1/memory/me") {
        return {
          user_id: "u1",
          company_rules: [],
          agent_rules: [],
          effective: [],
          pending: [],
          review_before_apply: false,
          limits: { rules: 12, words: 25 },
        };
      }
      if (path === "/api/v1/memory/admin") return overview;
      if (path === "/api/v1/memory/settings") return { ...overview, review_before_apply: true };
      return {};
    });

    await render(wrap(<StyleMemoryScreen />));
    await waitFor(() => expect(screen.getByTestId("memory-review-switch")).toBeTruthy());
    await fireEvent(screen.getByTestId("memory-review-switch"), "valueChange", true);
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith("/api/v1/memory/settings", {
        method: "PUT",
        body: { review_before_apply: true },
      }),
    );
  });
});
