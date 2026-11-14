import type { CloudState } from "../../lib/cloud";
import { byoOf } from "../keys/byo";
import { canPublish, liveOf, type PromptVersionRow, type StudioKey } from "./api";
import {
  draftOf,
  lineDiff,
  type PromptDoc,
  publishedOf,
  publishVersion,
  saveDraft,
  unknownVariables,
} from "./studio";

const DOC: PromptDoc = {
  key: "suggest",
  description: "Live suggestion card",
  scope: "company",
  variables: ["company.name", "playbook.match"],
  versions: [
    { version: 1, body: "A {{company.name}}", status: "published", created: "2026-10-01" },
  ],
};

describe("prompt studio (R6: create v2, publish, roll back to v1)", () => {
  it("saves a new draft, then updates the same draft", () => {
    const one = saveDraft(DOC, "B {{playbook.match}}", "2026-10-19");
    expect(draftOf(one)?.version).toBe(2);
    const two = saveDraft(one, "C", "2026-10-19");
    expect(two.versions).toHaveLength(2);
    expect(draftOf(two)?.body).toBe("C");
  });

  it("publishes v2 and archives v1, then rolls back to v1", () => {
    const v2 = publishVersion(saveDraft(DOC, "B", "2026-10-19"), 2);
    expect(publishedOf(v2)?.version).toBe(2);
    expect(v2.versions.find((v) => v.version === 1)?.status).toBe("archived");
    expect(draftOf(v2)).toBeUndefined();
    const back = publishVersion(v2, 1);
    expect(publishedOf(back)?.version).toBe(1);
    expect(back.versions.find((v) => v.version === 2)?.status).toBe("archived");
  });

  it("flags variables the catalogue does not know (the registry renders strictly)", () => {
    expect(unknownVariables("{{company.name}} {{ crm.deal.stage }} {{x}}", DOC.variables)).toEqual([
      "crm.deal.stage",
      "x",
    ]);
    expect(unknownVariables("plain", DOC.variables)).toEqual([]);
  });

  it("diffs line by line", () => {
    expect(lineDiff("a\nb\nc", "a\nB\nc")).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
      { kind: "add", text: "B" },
      { kind: "same", text: "c" },
    ]);
  });

  it("publishing an unknown version changes nothing", () => {
    expect(publishVersion(DOC, 9)).toBe(DOC);
  });
});

// --- T-079: server-backed studio and BYO (D-059) ---------------------------------------------

const signedIn = (features: Record<string, unknown>): CloudState =>
  ({
    status: "signed_in",
    bundle: null,
    me: { user: { id: "u" }, company: { id: "c" }, features },
  }) as unknown as CloudState;

const row = (over: Partial<PromptVersionRow>): PromptVersionRow => ({
  id: "v",
  key: "suggest",
  scope: "company",
  version: 4,
  body: "x",
  status: "draft",
  created_at: 1,
  published_at: null,
  test: null,
  ...over,
});

describe("BYO gate (D-059)", () => {
  it("reads the platform entitlement from the feature map", () => {
    expect(byoOf(signedIn({ byo_providers: { state: "off_by_platform" } }))?.state).toBe(
      "off_by_platform",
    );
    expect(byoOf(signedIn({ byo_providers: { state: "available" } }))?.state).toBe("available");
  });
  it("is null without a server session or from a server that predates BYO", () => {
    expect(byoOf({ status: "off" })).toBeNull();
    expect(byoOf(signedIn({}))).toBeNull();
  });
});

describe("company prompt studio (DD-2)", () => {
  it("publishes only tested versions, or earlier live ones (rollback)", () => {
    expect(canPublish(row({}))).toBe(false);
    expect(
      canPublish(row({ test: { passed: true, synthetic: true, quality: 1, detail: "" } })),
    ).toBe(true);
    expect(
      canPublish(row({ test: { passed: false, synthetic: true, quality: 0, detail: "" } })),
    ).toBe(false);
    expect(canPublish(row({ status: "retired", published_at: 5 }))).toBe(true);
    expect(canPublish(row({ status: "published", published_at: 5 }))).toBe(false);
  });
  it("names the live version, else AGN's", () => {
    const key: StudioKey = {
      key: "suggest",
      stage: "suggest",
      variables: [],
      seed: { version: 3, body: "" },
      versions: [row({ id: "a" }), row({ id: "b", status: "published" })],
    };
    expect(liveOf(key)?.id).toBe("b");
    expect(liveOf({ ...key, versions: [] })).toBeNull();
  });
});
