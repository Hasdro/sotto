/**
 * Unit tests for Post-Call Wizard state machine, <30s suppression, hidden steps,
 * Back/Skip/Next without sending, 24h draft expiry / 7d feedback queue, and Round 4
 * rating reason normalization (A1–A2, R11).
 */
import { isRateable, normalizeReason, REASONS_FOR } from "../rating/ratings";
import {
  computeVisibleSteps,
  goBack,
  goNext,
  goSkip,
  initWizardNav,
  isDraftExpired,
  isFeedbackQueueExpired,
  shouldOpenWizard,
  WIZARD_DRAFT_TTL_MS,
  WIZARD_FEEDBACK_TTL_MS,
} from "./steps";

describe("Post-call wizard state machine (A1)", () => {
  it("suppresses the wizard for calls shorter than 30 seconds", () => {
    expect(shouldOpenWizard({ durationS: 29, wizardEnabled: true })).toBe(false);
    expect(shouldOpenWizard({ durationS: 30, wizardEnabled: true })).toBe(true);
    expect(shouldOpenWizard({ durationS: 120, wizardEnabled: false })).toBe(false);
    expect(
      computeVisibleSteps({
        durationS: 15,
        wizardEnabled: true,
        whatsappEnabled: true,
        whatsappSuggested: true,
        emailEnabled: true,
        emailSuggested: true,
        zohoEnabled: true,
        zohoSuggested: true,
      }),
    ).toEqual([]);
  });

  it("hides steps 2–4 when their feature is off or nothing is suggested", () => {
    const steps = computeVisibleSteps({
      durationS: 90,
      wizardEnabled: true,
      whatsappEnabled: false,
      whatsappSuggested: true,
      emailEnabled: true,
      emailSuggested: false,
      zohoEnabled: true,
      zohoSuggested: true,
    });
    expect(steps.map((s) => s.id)).toEqual(["review", "zoho", "feedback"]);
  });

  it("navigates Back / Skip / Next in order and never triggers sends", () => {
    const steps = computeVisibleSteps({
      durationS: 120,
      wizardEnabled: true,
      whatsappEnabled: true,
      whatsappSuggested: true,
      emailEnabled: true,
      emailSuggested: true,
      zohoEnabled: true,
      zohoSuggested: true,
    });
    expect(steps.map((s) => s.number)).toEqual([1, 2, 3, 4, 5]);
    let nav = initWizardNav(steps);
    expect(nav.steps[nav.index]?.id).toBe("review");

    nav = goNext(nav);
    expect(nav.steps[nav.index]?.id).toBe("whatsapp");
    expect(nav.sentCount).toBe(0);

    nav = goSkip(nav);
    expect(nav.steps[nav.index]?.id).toBe("email");
    expect(nav.skipped).toEqual([2]);
    expect(nav.sentCount).toBe(0);

    nav = goBack(nav);
    expect(nav.steps[nav.index]?.id).toBe("whatsapp");
    expect(nav.sentCount).toBe(0);
  });

  it("resumes within 24h, expires unsent drafts after 24h keeping feedback for 7 days", () => {
    const t0 = 1_700_000_000_000;
    expect(isDraftExpired(t0, t0 + WIZARD_DRAFT_TTL_MS - 1)).toBe(false);
    expect(isDraftExpired(t0, t0 + WIZARD_DRAFT_TTL_MS)).toBe(true);
    expect(isFeedbackQueueExpired(t0, t0 + WIZARD_DRAFT_TTL_MS + 1000)).toBe(false);
    expect(isFeedbackQueueExpired(t0, t0 + WIZARD_FEEDBACK_TTL_MS)).toBe(true);

    const expiredSteps = computeVisibleSteps({
      durationS: 120,
      wizardEnabled: true,
      whatsappEnabled: true,
      whatsappSuggested: true,
      emailEnabled: true,
      emailSuggested: true,
      zohoEnabled: true,
      zohoSuggested: true,
      draftsExpired: true,
    });
    expect(expiredSteps.map((s) => s.id)).toEqual(["feedback"]);
  });
});

describe("Card feedback reasons and R11 rateability (A2, R11)", () => {
  it("maps legacy not_our_style to too_formal and exposes Round 4 down reasons", () => {
    expect(normalizeReason("not_our_style")).toBe("too_formal");
    expect(REASONS_FOR.down).toEqual(["too_long", "too_formal", "wrong", "not_relevant"]);
  });

  it("only allows rating AI and backup advice cards (never playbook or holding)", () => {
    expect(isRateable({ type: "answer", source: "ai" })).toBe(true);
    expect(isRateable({ type: "objection", source: "backup" })).toBe(true);
    expect(isRateable({ type: "answer", source: "playbook" })).toBe(false);
    expect(isRateable({ type: "holding", source: "holding" })).toBe(false);
    expect(isRateable({ type: "holding", source: "ai" })).toBe(false);
  });
});
