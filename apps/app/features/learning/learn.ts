/**
 * After a call with at least three ratings (D-034, T-059): the device sends the minimised packet
 * to the `learned_extract` prompt on the summary stage, then sends only the resulting list to the
 * server. The new list reaches the live prompt through the next bundle, never the call that just
 * ended or one already running.
 */
import { type CallBundle, type ModelRouter, renderPrompt } from "@sotto/engine";
import { cloudApi, cloudState, refreshFeatures } from "../../lib/cloud";
import type { DeviceEntry } from "../../lib/deviceHistory";
import { stateOf } from "../flags/catalog";
import { ratingsFor } from "../rating/ratings";
import { buildPacket, MAX_ITEMS, MIN_RATINGS } from "./packet";

const MAX_WORDS = 25;

/** "- rule" lines → at most 8 rules of at most 25 words; NONE → []; junk → null. */
export function parseInstructions(raw: string): string[] | null {
  const text = raw.trim();
  if (/^NONE\.?$/i.test(text)) return [];
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const m = /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/.exec(line);
    const rule = m?.[1]?.replace(/\s+/g, " ").trim();
    if (!rule || rule.split(" ").length > MAX_WORDS || out.includes(rule)) continue;
    out.push(rule);
  }
  return out.length ? out.slice(0, MAX_ITEMS) : null;
}

export function learningAllowed(): boolean {
  const s = cloudState();
  return (
    s.status === "signed_in" && stateOf(s.me.features, "learned_instructions").state === "available"
  );
}

/** Runs once per call; never throws. Resolves to the instructions sent, or null. */
export async function learnAfterCall(opts: {
  callId: string;
  router: ModelRouter;
  bundle: CallBundle;
  transcript: readonly DeviceEntry[];
  summary: string;
  brief: string;
  now: number;
}): Promise<string[] | null> {
  const prompt = opts.bundle.prompts.learned_extract;
  const ratings = ratingsFor(opts.callId);
  if (!prompt || ratings.length < MIN_RATINGS || !learningAllowed()) return null;
  try {
    const current = opts.bundle.learned?.instructions ?? [];
    const body = renderPrompt(prompt.body, {
      "company.name": opts.bundle.company.name,
      "learning.current": current.length ? current.map((l) => `- ${l}`).join("\n") : "(none)",
      "learning.max_items": String(MAX_ITEMS),
      "call.packet": buildPacket({
        summary: opts.summary,
        brief: opts.brief,
        transcript: opts.transcript,
        ratings,
      }),
    });
    let out = "";
    for await (const chunk of opts.router.stream(
      "summary",
      {
        system: "",
        messages: [{ role: "user", content: body }],
        max_tokens: 400,
        temperature: 0.2,
        settings: {},
      },
      { t0: opts.now },
    ))
      out += chunk;
    const instructions = parseInstructions(out);
    if (instructions === null) return null;
    await cloudApi("/api/v1/learning/proposals", {
      method: "POST",
      body: { call_id: opts.callId, instructions },
    });
    void refreshFeatures(); // a new active version reloads the bundle between calls
    return instructions;
  } catch (err) {
    console.warn("[learning] not learned", err);
    return null;
  }
}
