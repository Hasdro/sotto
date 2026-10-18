import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { demoJsonSchema, parseDemoClientMessage, parseDemoServerMessage } from "./demo.ts";

const fixtures = join(import.meta.dirname, "..", "fixtures", "demo");
const load = (dir: string) =>
  readdirSync(join(fixtures, dir))
    .filter((f) => f.endsWith(".json"))
    .map((f) => [f, JSON.parse(readFileSync(join(fixtures, dir, f), "utf8"))] as const);
const parserFor = (name: string) =>
  name.startsWith("client-") ? parseDemoClientMessage : parseDemoServerMessage;

describe("demo bridge protocol v1", () => {
  it.each(load("valid"))("accepts valid/%s", (name, msg) => {
    expect(() => parserFor(name)(msg)).not.toThrow();
  });

  it.each(load("invalid"))("rejects invalid/%s", (name, msg) => {
    expect(() => parserFor(name)(msg)).toThrow();
  });

  it("keeps the committed JSON Schema in sync", () => {
    const committed = JSON.parse(
      readFileSync(join(import.meta.dirname, "..", "schema", "demo.v1.schema.json"), "utf8"),
    );
    expect(committed).toEqual(demoJsonSchema());
  });
});
