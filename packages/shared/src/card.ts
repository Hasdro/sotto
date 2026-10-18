/**
 * Card protocol v1: worker → app messages over the LiveKit data channel.
 *
 * This zod schema is the single source of truth (ENGINEERING §4). The JSON Schema in
 * `schema/card.v1.schema.json` is generated from it (`pnpm gen`), and the worker's
 * pydantic model is generated from that JSON Schema. Never write the shape twice.
 *
 * A card streams as several messages that share a `card_id`. `seq` orders them, each
 * `delta` appends text, and `done: true` closes the card. The app shows the first delta
 * immediately; it counts as "shown" for R1.
 *
 * Optional fields may be absent or null. The worker omits them (`CardMessage.to_wire`).
 */
import { z } from "zod";

export const CARD_PROTOCOL_VERSION = 1 as const;

export const CARD_TYPES = ["answer", "question", "objection", "warning", "holding"] as const;
export const CARD_SOURCES = ["playbook", "ai", "backup", "holding"] as const;

const ms = z.int().nonnegative();

export const CardTiming = z.strictObject({
  turn_end_ms: ms,
  stt_final_ms: ms,
  lookup_ms: ms,
  first_token_ms: ms,
});

export const CardMessage = z.strictObject({
  v: z.literal(CARD_PROTOCOL_VERSION),
  card_id: z.uuid(),
  call_id: z.uuid(),
  seq: z.int().nonnegative(),
  type: z.enum(CARD_TYPES),
  source: z.enum(CARD_SOURCES),
  /** Shown above the text, e.g. the R2 "not in playbook" warning. Already localised by the worker. */
  label: z.string().min(1).nullish(),
  delta: z.string(),
  done: z.boolean(),
  timing: CardTiming.nullish(),
});

export type CardMessage = z.infer<typeof CardMessage>;
export type CardType = (typeof CARD_TYPES)[number];
export type CardSource = (typeof CARD_SOURCES)[number];

/** Parses an untrusted data-channel payload. Throws a ZodError on anything that is not a v1 card. */
export function parseCardMessage(input: unknown): CardMessage {
  return CardMessage.parse(input);
}

export function cardMessageJsonSchema(): Record<string, unknown> {
  return {
    ...z.toJSONSchema(CardMessage, { target: "draft-2020-12" }),
    $id: "urn:sotto:schema:card:v1",
    title: "CardMessage",
  };
}
