/**
 * Demo bridge protocol v1 (D-013): the Expo app ↔ the local worker over a WebSocket on
 * 127.0.0.1, dev-only. The customer side is typed or scripted instead of STT and telephony;
 * cards are the real card protocol (card.ts). Generated JSON Schema: schema/demo.v1.schema.json.
 */
import { z } from "zod";
import { CardMessage } from "./card.ts";

export const DEMO_PROTOCOL_VERSION = 1 as const;
export const DEMO_DEFAULT_PORT = 8787 as const;

const text = z.string().min(1).max(2000);
const speaker = z.enum(["customer", "agent"]);

export const DemoClientMessage = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("start"), scenario_id: z.string().min(1).nullish() }),
  z.strictObject({ type: z.literal("say"), speaker, text }),
  z.strictObject({ type: z.literal("end") }),
]);
export type DemoClientMessage = z.infer<typeof DemoClientMessage>;

export const DemoScenario = z.strictObject({ id: z.string().min(1), title: z.string().min(1) });

export const DemoServerMessage = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("hello"),
    v: z.literal(DEMO_PROTOCOL_VERSION),
    company_name: z.string().min(1),
    /** "live" when a real model is configured (API key present), else "fake". */
    mode: z.enum(["fake", "live"]),
    scenarios: z.array(DemoScenario),
  }),
  z.strictObject({ type: z.literal("call_started"), call_id: z.uuid() }),
  z.strictObject({
    type: z.literal("transcript"),
    speaker,
    text,
    /** Milliseconds since call start. */
    at_ms: z.int().nonnegative(),
  }),
  /** The customer finished a turn that may need a card (the R1 clock starts). */
  z.strictObject({
    type: z.literal("turn_end"),
    at_ms: z.int().nonnegative(),
    /** Set when the turn may produce a card; matches CardMessage.turn_id. */
    turn_id: z.uuid().nullish(),
  }),
  z.strictObject({ type: z.literal("card"), card: CardMessage }),
  z.strictObject({ type: z.literal("escalation"), question: text }),
  z.strictObject({ type: z.literal("call_ended"), call_id: z.uuid() }),
  z.strictObject({ type: z.literal("error"), message: z.string().min(1) }),
]);
export type DemoServerMessage = z.infer<typeof DemoServerMessage>;

export function parseDemoServerMessage(input: unknown): DemoServerMessage {
  return DemoServerMessage.parse(input);
}

export function parseDemoClientMessage(input: unknown): DemoClientMessage {
  return DemoClientMessage.parse(input);
}

export function demoJsonSchema(): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "urn:sotto:schema:demo:v1",
    title: "DemoProtocol",
    $defs: {
      DemoClientMessage: z.toJSONSchema(DemoClientMessage, { target: "draft-2020-12" }),
      DemoServerMessage: z.toJSONSchema(DemoServerMessage, { target: "draft-2020-12" }),
    },
  };
}
