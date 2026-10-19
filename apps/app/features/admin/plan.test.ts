import { bannerFor, samplePlan } from "./plan";

const NOW = Date.parse("2026-10-21T08:00:00Z");
const DAY = 86_400_000;

describe("plan banner (R3)", () => {
  it("counts whole days left in a trial, rounding up", () => {
    expect(bannerFor(samplePlan(NOW), NOW)).toEqual({ kind: "trial", daysLeft: 9, urgent: false });
    const plan = { ...samplePlan(NOW), trialEndsAt: new Date(NOW + 2.2 * DAY).toISOString() };
    expect(bannerFor(plan, NOW)).toEqual({ kind: "trial", daysLeft: 3, urgent: true });
  });

  it("blocks calls once the trial is over, and for expired or suspended plans", () => {
    const ended = { ...samplePlan(NOW), trialEndsAt: new Date(NOW - 1).toISOString() };
    expect(bannerFor(ended, NOW)).toEqual({ kind: "blocked", reason: "expired" });
    expect(bannerFor({ ...samplePlan(NOW), state: "suspended" }, NOW)).toEqual({
      kind: "blocked",
      reason: "suspended",
    });
  });

  it("shows nothing for an active plan", () => {
    expect(bannerFor({ ...samplePlan(NOW), state: "active", trialEndsAt: null }, NOW)).toBeNull();
  });
});
