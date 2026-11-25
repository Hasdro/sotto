/**
 * Pure state machine and visibility rules for the 5-step Post-Call Wizard (Round 4, A1).
 * Kept free of React/RN imports so every rule is fast and directly unit-testable.
 */

export const MIN_WIZARD_DURATION_S = 30;
export const WIZARD_DRAFT_TTL_MS = 24 * 3600 * 1000;
export const WIZARD_FEEDBACK_TTL_MS = 7 * 24 * 3600 * 1000;

export type WizardStepNumber = 1 | 2 | 3 | 4 | 5;
export type WizardStepId = "review" | "whatsapp" | "email" | "zoho" | "feedback";

export type WizardStepDef = {
  number: WizardStepNumber;
  id: WizardStepId;
  boundaryName: `wizard.step${WizardStepNumber}`;
};

export const ALL_WIZARD_STEPS: readonly WizardStepDef[] = [
  { number: 1, id: "review", boundaryName: "wizard.step1" },
  { number: 2, id: "whatsapp", boundaryName: "wizard.step2" },
  { number: 3, id: "email", boundaryName: "wizard.step3" },
  { number: 4, id: "zoho", boundaryName: "wizard.step4" },
  { number: 5, id: "feedback", boundaryName: "wizard.step5" },
];

export type WizardAvailability = {
  /** Duration of the call in seconds; < 30s suppresses the wizard and review (A1). */
  durationS: number;
  /** Feature flag `postcall_wizard` is available. */
  wizardEnabled: boolean;
  /** Step 2: WhatsApp feature available AND a WhatsApp follow-up is suggested. */
  whatsappEnabled: boolean;
  whatsappSuggested: boolean;
  /** Step 3: Email follow-up feature available AND an email follow-up is suggested. */
  emailEnabled: boolean;
  emailSuggested: boolean;
  /** Step 4: Zoho feature available AND at least one Zoho action is suggested. */
  zohoEnabled: boolean;
  zohoSuggested: boolean;
  /** True when resuming after 24h draft expiry (only Step 5 feedback remains). */
  draftsExpired?: boolean;
};

/** Whether the post-call wizard should open for this call (A1: < 30s -> no wizard). */
export function shouldOpenWizard(avail: Pick<WizardAvailability, "durationS" | "wizardEnabled">): boolean {
  return avail.wizardEnabled && avail.durationS >= MIN_WIZARD_DURATION_S;
}

/**
 * Compute visible wizard steps in order.
 * Steps 2–4 are hidden when their feature is off or nothing is suggested (A1).
 * When unsent drafts have expired (> 24h), only Step 5 (Card feedback) remains (7-day queue).
 */
export function computeVisibleSteps(avail: WizardAvailability): WizardStepDef[] {
  if (!shouldOpenWizard(avail)) return [];
  if (avail.draftsExpired) {
    return [ALL_WIZARD_STEPS[4]!];
  }
  return ALL_WIZARD_STEPS.filter((step) => {
    if (step.id === "review" || step.id === "feedback") return true;
    if (step.id === "whatsapp") return avail.whatsappEnabled && avail.whatsappSuggested;
    if (step.id === "email") return avail.emailEnabled && avail.emailSuggested;
    if (step.id === "zoho") return avail.zohoEnabled && avail.zohoSuggested;
    return false;
  });
}

export type WizardNavState = {
  steps: readonly WizardStepDef[];
  index: number;
  skipped: readonly WizardStepNumber[];
  completed: readonly WizardStepNumber[];
  /** Proof invariant: navigation (Back/Skip/Next) NEVER triggers sends or CRM writes. */
  sentCount: number;
};

export function initWizardNav(
  steps: readonly WizardStepDef[],
  resumeStep?: WizardStepNumber,
): WizardNavState {
  let index = 0;
  if (resumeStep !== undefined) {
    const found = steps.findIndex((s) => s.number === resumeStep);
    if (found >= 0) index = found;
  }
  return { steps, index, skipped: [], completed: [], sentCount: 0 };
}

export function goNext(state: WizardNavState): WizardNavState {
  const current = state.steps[state.index];
  if (!current) return state;
  const completed = state.completed.includes(current.number)
    ? state.completed
    : [...state.completed, current.number];
  const nextIndex = Math.min(state.steps.length - 1, state.index + 1);
  return { ...state, index: nextIndex, completed };
}

export function goBack(state: WizardNavState): WizardNavState {
  return { ...state, index: Math.max(0, state.index - 1) };
}

export function goSkip(state: WizardNavState): WizardNavState {
  const current = state.steps[state.index];
  if (!current) return state;
  const skipped = state.skipped.includes(current.number)
    ? state.skipped
    : [...state.skipped, current.number];
  const nextIndex = Math.min(state.steps.length - 1, state.index + 1);
  return { ...state, index: nextIndex, skipped };
}

export function isDraftExpired(savedAtMs: number, nowMs: number): boolean {
  return nowMs >= savedAtMs + WIZARD_DRAFT_TTL_MS;
}

export function isFeedbackQueueExpired(savedAtMs: number, nowMs: number): boolean {
  return nowMs >= savedAtMs + WIZARD_FEEDBACK_TTL_MS;
}
