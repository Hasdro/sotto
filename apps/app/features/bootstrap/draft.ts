/**
 * The device drafts the pairs (D-022, like features/learning/learn.ts): the `playbook_bootstrap`
 * prompt from the bundle on the summary stage, then only the resulting pairs go to the server,
 * where they wait as "needs review". A pasted document never leaves the device except as pairs.
 */
import { type CallBundle, type ModelRouter, renderPrompt } from "@sotto/engine";
import type { BootstrapSource, Pair } from "./api";

export const MAX_ITEMS = 25;
export const MAX_MATERIAL_CHARS = 20_000;
const MAX_ANSWER_WORDS = 40;
const SOURCE_NAME: Record<BootstrapSource, string> = {
  zoho: "the company's won deals and their notes in Zoho CRM",
  website: "the company's own website",
  document: "a document the company pasted",
};

/** "Q: … / A: …" pairs → at most MAX_ITEMS clean pairs; NONE → []; junk → null. */
export function parsePairs(raw: string): Pair[] | null {
  const text = raw.trim();
  if (/^NONE\.?$/i.test(text)) return [];
  const out: Pair[] = [];
  let question = "";
  for (const line of text.split("\n")) {
    const q = /^\s*Q\s*[:：]\s*(.+)$/i.exec(line);
    const a = /^\s*A\s*[:：]\s*(.+)$/i.exec(line);
    if (q?.[1]) question = q[1].replace(/\s+/g, " ").trim();
    else if (a?.[1] && question) {
      const words = a[1].replace(/\s+/g, " ").trim().split(" ");
      const answer = words.slice(0, MAX_ANSWER_WORDS).join(" ");
      if (!out.some((p) => p.question === question)) out.push({ question, answer });
      question = "";
    }
  }
  return out.length ? out.slice(0, MAX_ITEMS) : null;
}

export async function draftPairs(opts: {
  router: ModelRouter;
  bundle: CallBundle;
  source: BootstrapSource;
  material: string;
  now: number;
}): Promise<Pair[] | null> {
  const prompt = opts.bundle.prompts.playbook_bootstrap;
  if (!prompt) return null;
  const body = renderPrompt(prompt.body, {
    "company.name": opts.bundle.company.name,
    "bootstrap.source": SOURCE_NAME[opts.source],
    "bootstrap.max_items": String(MAX_ITEMS),
    "bootstrap.material": opts.material.slice(0, MAX_MATERIAL_CHARS),
  });
  let out = "";
  for await (const chunk of opts.router.stream(
    "summary",
    {
      system: "",
      messages: [{ role: "user", content: body }],
      max_tokens: 2000,
      temperature: 0.2,
      settings: {},
    },
    { t0: opts.now },
  ))
    out += chunk;
  return parsePairs(out);
}
