/**
 * Call-start policy for the `livekit-token` edge function (P4.2, ARCHITECTURE §2).
 * Pure: the Deno entry point loads the rows with the caller's JWT (RLS applies), calls this,
 * then signs the token and dials through the LiveKit adapter (Phase 4, needs the account).
 */

export type Role = "company_admin" | "sales_manager" | "agent";
export type PlanState = "trial" | "active" | "expired" | "suspended";

export type CallContext = {
  userId: string;
  request: { company_id: string; phone_number: string; device_id: string };
  membership: { company_id: string; role: Role } | null;
  company: { plan_state: PlanState; trial_ends_at: string; allowed_country_codes: string[] };
  device: { id: string; user_id: string; company_id: string; revoked_at: string | null } | null;
  callsStartedLastHour: number;
  now: number;
};

export type Grants = {
  roomJoin: true;
  canPublish: true;
  canPublishSources: ["microphone"];
  canSubscribe: true;
  canPublishData: false;
  canUpdateOwnMetadata: false;
};

export type Decision =
  | {
      allowed: true;
      repIdentity: string;
      customerIdentity: string;
      grants: Grants;
      ttlSeconds: number;
    }
  | {
      allowed: false;
      reason:
        | "bad_request"
        | "not_member"
        | "plan_blocked"
        | "device_revoked"
        | "destination_blocked"
        | "rate_limited";
      status: number;
    };

const CALLING_ROLES: ReadonlySet<Role> = new Set(["company_admin", "sales_manager", "agent"]);
const E164 = /^\+[1-9]\d{6,14}$/;
const MAX_CALLS_PER_USER_PER_HOUR = 40;
const TOKEN_TTL_SECONDS = 600;

export function decideCallStart(ctx: CallContext): Decision {
  const { request, membership, company, device } = ctx;
  if (!E164.test(request.phone_number)) return deny("bad_request", 400);
  if (
    !membership ||
    membership.company_id !== request.company_id ||
    !CALLING_ROLES.has(membership.role)
  ) {
    return deny("not_member", 403);
  }
  const trialOver = company.plan_state === "trial" && Date.parse(company.trial_ends_at) <= ctx.now;
  if (company.plan_state === "expired" || company.plan_state === "suspended" || trialOver) {
    return deny("plan_blocked", 402);
  }
  if (
    !device ||
    device.id !== request.device_id ||
    device.user_id !== ctx.userId ||
    device.company_id !== request.company_id ||
    device.revoked_at !== null
  ) {
    return deny("device_revoked", 403);
  }
  if (!company.allowed_country_codes.some((code) => request.phone_number.startsWith(code))) {
    return deny("destination_blocked", 403);
  }
  if (ctx.callsStartedLastHour >= MAX_CALLS_PER_USER_PER_HOUR) return deny("rate_limited", 429);
  return {
    allowed: true,
    // Never "agent_…": LiveKit uses agent participants for workers (F-13).
    repIdentity: `rep_${ctx.userId}`,
    customerIdentity: `customer_${crypto.randomUUID()}`,
    grants: {
      roomJoin: true,
      canPublish: true,
      canPublishSources: ["microphone"],
      canSubscribe: true,
      canPublishData: false,
      canUpdateOwnMetadata: false,
    },
    ttlSeconds: TOKEN_TTL_SECONDS,
  };
}

function deny(reason: Extract<Decision, { allowed: false }>["reason"], status: number): Decision {
  return { allowed: false, reason, status };
}
