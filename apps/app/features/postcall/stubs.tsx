/**
 * Cross-agent stub for Agent 3 (`startReview`) until Round 4 voice-coach merges.
 * Agent 4 utilities (`logEvent`, `enqueue`, `SafeBoundary`) now resolve directly to real modules.
 */
import { logEvent } from "../../lib/obs";

// STUB(agent-3): replaced at merge with `import { startReview } from "../coach/api"`
export async function startReview(callId: string): Promise<{ sessionId: string }> {
  logEvent("voice_coach", "review_requested_stub", { callId });
  return { sessionId: `coach-${callId}` };
}
