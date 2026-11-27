/**
 * Component & integration tests for Round 4 Agent 3 (Voice Coach UI):
 * - PrepCoachPanel (chat, editable game plan w/ objections, error notice, live attachedGamePlanText)
 * - GamePlanCard (empty hiding + populated render)
 * - ReviewQueueCard (pending badge, snooze 1h/tomorrow/custom, dismiss, morning brief on/off toggle)
 * - PostCallWizard Step 1 "Talk it through" -> real startReview(callId) -> VoiceReviewModal -> completeReview
 * - AdminCoachScreen (hidden when off_by_platform, localized cap/spend status, transcript toggle)
 */
import { themes, UIProvider } from "@sotto/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

let mockRole: "admin" | "agent" = "agent";
let mockFeatures: Record<string, { state: string }> = {
  prep_coach: { state: "available" },
  voice_coach: { state: "available" },
  morning_brief: { state: "available" },
  call_review: { state: "available" },
  postcall_wizard: { state: "available" },
  style_memory: { state: "available" },
  whatsapp: { state: "off_by_org" },
  email_send: { state: "off_by_org" },
  zoho: { state: "off_by_org" },
};

jest.mock("../lib/useCloud", () => ({
  useCloud: () => ({
    status: "signed_in",
    me: {
      user: { id: "u1", email: "agent@acme.test", name: "Agnes", role: mockRole },
      company: null,
      features: mockFeatures,
    },
    bundle: null,
  }),
}));

const mockApi = jest.fn();
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
    cloudActive: () => true,
    cloudApi: (...args: unknown[]) => mockApi(...args),
  };
});

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
}));

jest.mock("../features/review/CallReviewPanel", () => ({
  CallReviewPanel: ({ callId }: { callId: string | null }) => {
    const { Text } = require("react-native");
    return <Text testID="mock-review-panel">{`review:${callId ?? "none"}`}</Text>;
  },
}));

import AdminCoachScreen from "../app/admin/coach";
import { GamePlanCard } from "../features/coach/GamePlanCard";
import { PrepCoachPanel } from "../features/coach/PrepCoachPanel";
import { ReviewQueueCard } from "../features/coach/ReviewQueueCard";
import { closeReview } from "../features/coach/VoiceReviewModal";
import { attachedGamePlanText, resetCall } from "../features/crm/attached";
import { PostCallWizard } from "../features/postcall/PostCallWizard";
import { LocaleProvider } from "../lib/locale";

function wrap(ui: ReactNode, locale: "en" | "ar" = "en") {
  return (
    <LocaleProvider initial={locale}>
      <UIProvider direction={locale === "ar" ? "rtl" : "ltr"}>{ui}</UIProvider>
    </LocaleProvider>
  );
}

beforeEach(() => {
  mockApi.mockReset();
  mockRole = "agent";
  mockFeatures = {
    prep_coach: { state: "available" },
    voice_coach: { state: "available" },
    morning_brief: { state: "available" },
    call_review: { state: "available" },
    postcall_wizard: { state: "available" },
    style_memory: { state: "available" },
    whatsapp: { state: "off_by_org" },
    email_send: { state: "off_by_org" },
    zoho: { state: "off_by_org" },
  };
  closeReview();
  resetCall();
});

describe("Coach UI & E2E wiring (Round 4 Agent 3)", () => {
  it("PrepCoachPanel chats, builds/saves game plan w/ objections into attachedGamePlanText, and surfaces errors", async () => {
    const generatedPlan = {
      call_id: "prep-1",
      goals: ["Confirm timeline", "Book demo", "Align budget"],
      objections: [{ objection: "Too pricey", answer: "Highlight fast ROI." }],
      questions: ["What breaks today?"],
      avoid: ["Custom SLA"],
      rendered_text: "Goals: Confirm timeline; Objections: Too pricey -> Highlight fast ROI.",
      updated_at: 1000,
    };
    mockApi.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path.endsWith("/messages")) return { messages: [] };
      if (path.endsWith("/game-plan") && (!init?.method || init.method === "GET")) {
        return { game_plan: null };
      }
      if (path.endsWith("/chat")) {
        return {
          message: { id: "m2", role: "assistant", content: "Lead with ROI.", created_at: 100 },
          voice: false,
          audio_bytes: 0,
        };
      }
      if (path.endsWith("/game-plan") && init?.method === "POST") {
        return { game_plan: generatedPlan };
      }
      if (path.endsWith("/game-plan") && init?.method === "PUT") {
        return {
          game_plan: { ...generatedPlan, rendered_text: "Goals: Updated ROI goal." },
        };
      }
      return {};
    });

    await render(wrap(<PrepCoachPanel callId="prep-1" />));
    await waitFor(() => expect(screen.getByTestId("prep-coach-panel")).toBeTruthy());

    await fireEvent.changeText(screen.getByTestId("prep-coach-input"), "What opening?");
    await fireEvent.press(screen.getByTestId("prep-coach-send"));
    await waitFor(() => expect(screen.getByText("Lead with ROI.")).toBeTruthy());

    await fireEvent.press(screen.getByTestId("prep-coach-generate"));
    await waitFor(() => expect(attachedGamePlanText()).toContain("Goals: Confirm timeline"));

    await fireEvent.changeText(screen.getByTestId("plan-objections-input"), "Slow: Fast setup");
    await fireEvent.press(screen.getByTestId("plan-save-btn"));
    await waitFor(() => expect(screen.getByText("Game plan saved for this call.")).toBeTruthy());
    expect(attachedGamePlanText()).toBe("Goals: Updated ROI goal.");

    // Surface error cleanly on save failure instead of unhandled rejection
    mockApi.mockRejectedValueOnce(new Error("network down"));
    await fireEvent.press(screen.getByTestId("plan-save-btn"));
    await waitFor(() => expect(screen.getByTestId("prep-coach-error")).toBeTruthy());
  });

  it("PrepCoachPanel: a labelled question field that wraps, a Text/Voice choice, outline actions (UI-006, UI-007)", async () => {
    mockApi.mockImplementation(async (path: string) =>
      path.endsWith("/messages") ? { messages: [] } : { game_plan: null },
    );
    await render(wrap(<PrepCoachPanel callId="prep-2" />));
    await waitFor(() => expect(screen.getByTestId("prep-coach-panel")).toBeTruthy());
    const input = screen.getByTestId("prep-coach-input");
    expect(input.props.multiline).toBe(true); // the hint wraps instead of being cut off
    expect(screen.getByLabelText("Ask the coach")).toBeTruthy();
    expect(screen.getAllByText("Prep coach")).toHaveLength(1); // the title is not repeated
    // Replies come as text or voice: a labelled two-way choice, not a bare "Text" button.
    const replies = screen.getByTestId("prep-coach-voice-toggle");
    expect(replies.props.accessibilityLabel).toBe("Coach replies");
    await fireEvent.press(screen.getByRole("radio", { name: "Voice" }));
    expect(screen.getByRole("radio", { name: "Voice" }).props.accessibilityState).toMatchObject({
      checked: true,
    });
    for (const id of ["prep-coach-send", "prep-coach-generate", "plan-save-btn"]) {
      expect(screen.getByTestId(id)).toHaveStyle({ borderColor: themes.light.color.borderStrong });
    }
    expect(screen.queryByTestId("prep-coach-start-now")).toBeNull();
  });

  it("GamePlanCard hides when empty and displays all populated sections", async () => {
    const emptyPlan = {
      call_id: "c0",
      goals: [],
      objections: [],
      questions: [],
      avoid: [],
      rendered_text: "",
      updated_at: 1,
    };
    await render(wrap(<GamePlanCard plan={emptyPlan} />));
    expect(screen.queryByTestId("live-game-plan")).toBeNull();

    await render(
      wrap(
        <GamePlanCard
          plan={{
            ...emptyPlan,
            goals: ["Close pilot"],
            objections: [{ objection: "Cost", answer: "Trial first" }],
            questions: ["Timeline?"],
            avoid: ["Discounts"],
          }}
        />,
      ),
    );
    expect(screen.getByTestId("live-game-plan")).toBeTruthy();
  });

  it("ReviewQueueCard shows pending count, allows custom snooze, and keeps morning brief toggle accessible", async () => {
    let briefEnabled = true;
    mockApi.mockImplementation(async (path: string, init?: { body?: { enabled?: boolean } }) => {
      if (path === "/api/v1/coach/reviews") {
        return {
          reviews: [
            {
              id: "rev_1",
              call_id: "call_99",
              user_id: "u1",
              call_duration_s: 120,
              status: "pending",
              snoozed_until: null,
              reminded_at: null,
              expires_at: 999999999,
              feedback_note: null,
              created_at: 100,
              updated_at: 100,
            },
          ],
          pending_count: 1,
        };
      }
      if (path === "/api/v1/coach/morning-brief") {
        return {
          brief: {
            id: "mb_1",
            day: "2026-11-26",
            mode: "text",
            delivered_at: 100,
            content: {
              day: "2026-11-26",
              has_zoho_meetings: false,
              meetings: [],
              tip: "Ask timeline early.",
              pending_reviews_count: 1,
              summary_text: "Tip for today: Ask timeline early.",
            },
          },
          prefs: { enabled: briefEnabled, timezone_offset_min: 0, last_sent_day: "2026-11-26" },
        };
      }
      if (path === "/api/v1/coach/morning-brief/prefs") {
        briefEnabled = Boolean(init?.body?.enabled);
        return {
          prefs: { enabled: briefEnabled, timezone_offset_min: 0, last_sent_day: "2026-11-26" },
        };
      }
      return { review: { id: "rev_1", status: "snoozed" } };
    });

    await render(wrap(<ReviewQueueCard />));
    await waitFor(() => expect(screen.getByTestId("review-item-rev_1")).toBeTruthy());
    expect(screen.getByTestId("morning-brief-card")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("review-snooze-custom-rev_1"));
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith(
        "/api/v1/coach/reviews/rev_1/snooze",
        expect.objectContaining({ method: "POST" }),
      ),
    );

    // Turning brief off keeps toggle visible to turn back on
    await fireEvent.press(screen.getByTestId("morning-brief-toggle"));
    await waitFor(() => expect(screen.getByTestId("morning-brief-toggle")).toBeTruthy());
  });

  it("the Morning brief never calls a later meeting today's, whatever the server's sentence says (UX-002)", async () => {
    const inThreeDays = new Date(Date.now() + 3 * 86_400_000).toISOString();
    mockApi.mockImplementation(async (path: string) => {
      if (path === "/api/v1/coach/reviews") return { reviews: [], pending_count: 0 };
      if (path === "/api/v1/coach/morning-brief") {
        return {
          brief: {
            id: "mb_2",
            day: "2026-11-27",
            mode: "text",
            delivered_at: 100,
            content: {
              day: "2026-11-27",
              has_zoho_meetings: true,
              meetings: [{ title: "Desmond: quote walkthrough", start: inThreeDays }],
              tip: "Ask timeline early.",
              pending_reviews_count: 0,
              summary_text:
                "Today's meetings (1): Desmond: quote walkthrough. Tip for today: Ask timeline early.",
            },
          },
          prefs: { enabled: true, timezone_offset_min: 240, last_sent_day: "2026-11-27" },
        };
      }
      return {};
    });

    await render(wrap(<ReviewQueueCard />));
    await waitFor(() => expect(screen.getAllByTestId("morning-brief-line")).toHaveLength(2));
    const [meetings, tip] = screen.getAllByTestId("morning-brief-line");
    expect(meetings).toHaveTextContent(/^No meetings today · Next: /);
    expect(tip).toHaveTextContent("Tip for today: Ask timeline early.");
    expect(screen.queryByText(/Today's meetings/)).toBeNull();
    // The toggle is an outlined button: a sunken panel hides the grey "secondary" fill (UI-006).
    expect(screen.getByTestId("morning-brief-toggle")).toHaveStyle({
      borderColor: themes.light.color.borderStrong,
    });
  });

  it("PostCallWizard Step 1 'Talk it through' opens VoiceReviewModal and completes review via completeReview", async () => {
    mockApi.mockResolvedValue({
      review: { id: "rev_wiz", status: "done" },
      feedback_id: "fb_1",
    });

    await render(wrap(<PostCallWizard callId="call_wiz_1" durationS={90} cards={[]} />));
    await fireEvent.press(screen.getByTestId("wizard-talk-it-through"));
    await waitFor(() => expect(screen.getByTestId("voice-review-modal")).toBeTruthy());

    await fireEvent.changeText(
      screen.getByTestId("voice-review-remember-input"),
      "Confirm budget first.",
    );
    await fireEvent.press(screen.getByTestId("voice-review-finish"));
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith(
        "/api/v1/coach/reviews/call_wiz_1/complete",
        expect.objectContaining({
          method: "POST",
          body: expect.objectContaining({ remember_note: "Confirm budget first." }),
        }),
      ),
    );
  });

  it("AdminCoachScreen hides on off_by_platform and toggles admin transcript visibility when available", async () => {
    mockRole = "admin";
    mockFeatures.voice_coach = { state: "off_by_platform" };
    await render(wrap(<AdminCoachScreen />));
    expect(screen.queryByTestId("admin-coach-screen")).toBeNull();

    mockFeatures.voice_coach = { state: "available" };
    mockApi.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path === "/api/v1/coach/settings" && init?.method === "PUT") {
        return { allow_admin_transcript: true };
      }
      return {
        company_id: "c1",
        month: "2026-11",
        enabled: true,
        stages_configured: true,
        available: true,
        reason: "ok",
        cap_usd: 25,
        cap_minutes: 625,
        cost_per_min_usd: 0.04,
        spend_usd: 1.5,
        used_minutes: 37.5,
        ratio: 0.06,
        allow_admin_transcript: false,
      };
    });

    await render(wrap(<AdminCoachScreen />));
    await waitFor(() => expect(screen.getByTestId("admin-coach-screen")).toBeTruthy());
    expect(screen.getByText("Active")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("admin-coach-transcript-toggle"));
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith("/api/v1/coach/settings", {
        method: "PUT",
        body: { allow_admin_transcript: true },
      }),
    );
  });
});
