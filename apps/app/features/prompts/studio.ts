/**
 * Prompt studio rules (P6.2, R6) on mock data: one draft at a time, one published version,
 * publishing archives the previous one, and rollback is publishing an older version again.
 * Mirrors the worker's PromptRegistry (publish/rollback, strict variables) until Phase 6 wires
 * `prompt_versions` in Supabase.
 */
export type Scope = "platform" | "company" | "team" | "campaign";
export type VersionStatus = "published" | "draft" | "archived";

export type PromptVersion = {
  version: number;
  body: string;
  status: VersionStatus;
  /** ISO date. */
  created: string;
};

export type PromptDoc = {
  key: string;
  description: string;
  scope: Scope;
  /** The variable catalogue for this prompt's stage. */
  variables: readonly string[];
  versions: readonly PromptVersion[];
};

export const publishedOf = (doc: PromptDoc) => doc.versions.find((v) => v.status === "published");
export const draftOf = (doc: PromptDoc) => doc.versions.find((v) => v.status === "draft");

export function saveDraft(doc: PromptDoc, body: string, today: string): PromptDoc {
  const draft = draftOf(doc);
  if (draft) {
    return {
      ...doc,
      versions: doc.versions.map((v) => (v === draft ? { ...v, body, created: today } : v)),
    };
  }
  const next = Math.max(0, ...doc.versions.map((v) => v.version)) + 1;
  return {
    ...doc,
    versions: [...doc.versions, { version: next, body, status: "draft", created: today }],
  };
}

/** Publish a draft, or roll back by publishing an archived version. */
export function publishVersion(doc: PromptDoc, version: number): PromptDoc {
  if (!doc.versions.some((v) => v.version === version)) return doc;
  return {
    ...doc,
    versions: doc.versions.map((v): PromptVersion => {
      if (v.version === version) return { ...v, status: "published" };
      if (v.status === "published") return { ...v, status: "archived" };
      return v;
    }),
  };
}

const VARIABLE = /{{\s*([a-z0-9_.]+)\s*}}/gi;

export function unknownVariables(body: string, catalogue: readonly string[]): string[] {
  const used = [...body.matchAll(VARIABLE)].map((m) => m[1] as string);
  return [...new Set(used.filter((name) => !catalogue.includes(name)))];
}

export type DiffLine = { kind: "same" | "add" | "del"; text: string };

/** Line diff by longest common subsequence; prompts are short, so O(n·m) is fine. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const row = lcs[i] as number[];
      row[j] =
        a[i] === b[j]
          ? ((lcs[i + 1] as number[])[j + 1] as number) + 1
          : Math.max((lcs[i + 1] as number[])[j] as number, row[j + 1] as number);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] as string });
      i++;
      j++;
    } else if (((lcs[i + 1] as number[])[j] as number) >= ((lcs[i] as number[])[j + 1] as number)) {
      out.push({ kind: "del", text: a[i++] as string });
    } else {
      out.push({ kind: "add", text: b[j++] as string });
    }
  }
  while (i < a.length) out.push({ kind: "del", text: a[i++] as string });
  while (j < b.length) out.push({ kind: "add", text: b[j++] as string });
  return out;
}
