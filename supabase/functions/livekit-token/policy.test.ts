import { describe, expect, it } from "vitest";
import { type CallContext, decideCallStart } from "./policy.ts";

const NOW = Date.parse("2026-10-18T12:00:00Z");
const device = { id: "d1", user_id: "u1", company_id: "c1", revoked_at: null };
const ok: CallContext = {
  userId: "u1",
  request: { company_id: "c1", phone_number: "+971501234567", device_id: "d1" },
  membership: { company_id: "c1", role: "agent" },
  company: {
    plan_state: "trial",
    trial_ends_at: "2026-10-30T00:00:00Z",
    allowed_country_codes: ["+971", "+966"],
  },
  device,
  callsStartedLastHour: 3,
  now: NOW,
};

describe("livekit-token call-start policy (ARCHITECTURE §2, R3, R4)", () => {
  it("allows a valid call and grants the least privilege", () => {
    const d = decideCallStart(ok);
    expect(d.allowed).toBe(true);
    if (!d.allowed) return;
    expect(d.repIdentity).toBe("rep_u1");
    expect(d.customerIdentity).toMatch(/^customer_/);
    expect(d.grants).toEqual({
      roomJoin: true,
      canPublish: true,
      canPublishSources: ["microphone"],
      canSubscribe: true,
      canPublishData: false,
      canUpdateOwnMetadata: false,
    });
    expect(d.ttlSeconds).toBe(600);
  });

  it.each([
    ["not a member", { membership: null }, "not_member"],
    [
      "member of another company",
      { membership: { company_id: "c2", role: "agent" as const } },
      "not_member",
    ],
    [
      "trial expired",
      { company: { ...ok.company, trial_ends_at: "2026-10-01T00:00:00Z" } },
      "plan_blocked",
    ],
    ["suspended", { company: { ...ok.company, plan_state: "suspended" as const } }, "plan_blocked"],
    [
      "revoked device",
      { device: { ...device, revoked_at: "2026-10-17T00:00:00Z" } },
      "device_revoked",
    ],
    ["device of another user", { device: { ...device, user_id: "u9" } }, "device_revoked"],
    ["unknown device", { device: null }, "device_revoked"],
    [
      "destination not allowed",
      { request: { ...ok.request, phone_number: "+15551234567" } },
      "destination_blocked",
    ],
    ["malformed number", { request: { ...ok.request, phone_number: "0501234567" } }, "bad_request"],
    ["rate limited", { callsStartedLastHour: 60 }, "rate_limited"],
  ])("refuses: %s", (_name, override, reason) => {
    const d = decideCallStart({ ...ok, ...override } as CallContext);
    expect(d).toEqual({ allowed: false, reason, status: expect.any(Number) });
  });

  it("an active plan ignores the trial date", () => {
    const d = decideCallStart({
      ...ok,
      company: { ...ok.company, plan_state: "active", trial_ends_at: "2020-01-01T00:00:00Z" },
    });
    expect(d.allowed).toBe(true);
  });
});
