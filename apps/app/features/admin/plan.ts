/**
 * Plan states (R3): trial (default 14 days, seat + minute limits, banner with days left),
 * active, expired/suspended (sign-in works, calls blocked, data kept 30 days). Sample data until
 * Phase 5 reads the company's plan from Supabase (P5.5); the banner rules below stay.
 */
export type PlanState = "trial" | "active" | "expired" | "suspended";

export type Plan = {
  state: PlanState;
  /** ISO date-time; trials only. */
  trialEndsAt: string | null;
  seats: { used: number; limit: number };
  minutes: { used: number; limit: number };
};

const DAY_MS = 86_400_000;
export const TRIAL_DAYS = 14;
export const REMIND_DAYS = 3; // R3: reminder 3 days before the trial ends

/** The demo company's plan: a trial that started 5 days ago (so it always shows 9 days left). */
export function samplePlan(now: number = Date.now()): Plan {
  return {
    state: "trial",
    trialEndsAt: new Date(now + (TRIAL_DAYS - 5) * DAY_MS).toISOString(),
    seats: { used: 3, limit: 5 },
    minutes: { used: 412, limit: 1000 },
  };
}

export type Banner =
  | { kind: "trial"; daysLeft: number; urgent: boolean }
  | { kind: "blocked"; reason: "expired" | "suspended" }
  | null;

/** What the banner says for a plan at `now`. Whole days, rounded up: "1 day left" until the end. */
export function bannerFor(plan: Plan, now: number = Date.now()): Banner {
  if (plan.state === "expired" || plan.state === "suspended") {
    return { kind: "blocked", reason: plan.state };
  }
  if (plan.state !== "trial" || plan.trialEndsAt === null) return null;
  const msLeft = Date.parse(plan.trialEndsAt) - now;
  if (msLeft <= 0) return { kind: "blocked", reason: "expired" };
  const daysLeft = Math.ceil(msLeft / DAY_MS);
  return { kind: "trial", daysLeft, urgent: daysLeft <= REMIND_DAYS };
}
