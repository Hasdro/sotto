import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CARD_PROTOCOL_VERSION, cardMessageJsonSchema, parseCardMessage } from "./card.ts";

const fixtures = join(import.meta.dirname, "..", "fixtures", "cards");
const load = (dir: string) =>
  readdirSync(join(fixtures, dir))
    .filter((f) => f.endsWith(".json"))
    .map((f) => [f, JSON.parse(readFileSync(join(fixtures, dir, f), "utf8"))] as const);

describe("card protocol v1", () => {
  it.each(load("valid"))("accepts valid/%s", (_name, msg) => {
    const card = parseCardMessage(msg);
    expect(card.v).toBe(CARD_PROTOCOL_VERSION);
  });

  it.each(load("invalid"))("rejects invalid/%s", (_name, msg) => {
    expect(() => parseCardMessage(msg)).toThrow();
  });

  it("keeps the committed JSON Schema in sync with the zod schema", () => {
    const committed = JSON.parse(
      readFileSync(join(import.meta.dirname, "..", "schema", "card.v1.schema.json"), "utf8"),
    );
    expect(committed).toEqual(cardMessageJsonSchema());
  });
});
