/**
 * FUNC-002: why a call has no review, from what this computer kept. The review runs here after
 * the call (features/call/local.ts): it is skipped when the customer was never heard, stored as
 * null when the AI could not make it, and missing when it never ran (Call review was off, or the
 * app closed first). The old line sent everyone to "Admin → Keys & providers", which left the
 * app in Round 2 (D-078); AGN sets the models now (D-059).
 */
import type { DeviceCall } from "../../lib/deviceHistory";

export type NoReview = "unheard" | "failed" | "notRun";

export function noReviewReason(call: Pick<DeviceCall, "transcript" | "review"> | null): NoReview {
  if (!call) return "notRun";
  const heard = call.transcript.some((e) => e.kind === "line" && e.speaker === "customer");
  if (!heard) return "unheard";
  return call.review === null ? "failed" : "notRun";
}
