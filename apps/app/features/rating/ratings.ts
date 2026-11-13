/**
 * Card ratings (R11, D-034, T-058): only AI advice cards are rateable. A rating is kept on this
 * device with the card's text (for the after-call learning packet) and sent to the server
 * without any words from the call: card id, type, source, up/down and reason chips.
 */
import type { CardSource, CardType } from "@sotto/shared";
import { useSyncExternalStore } from "react";
import { cloudActive, cloudApi } from "../../lib/cloud";

export const RATING_REASONS = ["wrong", "too_long", "not_our_style", "good_phrasing"] as const;
export type RatingReason = (typeof RATING_REASONS)[number];
export type Rating = "up" | "down";

/** Reason chips offered after each choice. */
export const REASONS_FOR: Record<Rating, readonly RatingReason[]> = {
  up: ["good_phrasing"],
  down: ["wrong", "too_long", "not_our_style"],
};

export type RatedCard = {
  cardId: string;
  callId: string;
  type: CardType;
  source: CardSource;
  text: string;
  rating: Rating;
  reasons: RatingReason[];
};

type RateableCard = {
  id: string;
  callId: string;
  type: CardType;
  source: CardSource;
  text: string;
};

/** AI answer, statement, objection, signal or warning cards; never playbook or holding ones. */
export function isRateable(card: { type: CardType; source: CardSource }): boolean {
  return (card.source === "ai" || card.source === "backup") && card.type !== "holding";
}

const KEPT_CALLS = 3;
let byCall = new Map<string, Map<string, RatedCard>>();
let version = 0;
const listeners = new Set<() => void>();

function changed(): void {
  version += 1;
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function ratingOf(callId: string, cardId: string): RatedCard | undefined {
  return byCall.get(callId)?.get(cardId);
}

/** The ratings of one call, in the order they were given. */
export function ratingsFor(callId: string): RatedCard[] {
  return [...(byCall.get(callId)?.values() ?? [])];
}

/** Sets, changes or (rating null) clears one card's rating. Never throws. */
export function rateCard(
  card: RateableCard,
  rating: Rating | null,
  reasons: readonly RatingReason[] = [],
): void {
  if (!isRateable(card)) return;
  let call = byCall.get(card.callId);
  if (!call) {
    call = new Map();
    byCall.set(card.callId, call);
    // Only the last few calls stay in memory: the packet is built right after a call ends.
    if (byCall.size > KEPT_CALLS) byCall = new Map([...byCall].slice(-KEPT_CALLS));
  }
  const allowed = rating ? reasons.filter((r) => REASONS_FOR[rating].includes(r)) : [];
  if (rating) {
    call.set(card.id, {
      cardId: card.id,
      callId: card.callId,
      type: card.type,
      source: card.source,
      text: card.text,
      rating,
      reasons: [...new Set(allowed)],
    });
  } else call.delete(card.id);
  changed();
  if (!cloudActive()) return;
  void cloudApi("/api/v1/ratings", {
    method: "POST",
    body: {
      call_id: card.callId,
      card_id: card.id,
      card_type: card.type,
      card_source: card.source,
      rating,
      reasons: allowed,
    },
  }).catch((err: unknown) => console.warn("[rating] not saved", err));
}

/** Re-renders when any rating changes; returns this card's current rating. */
export function useRating(callId: string, cardId: string): RatedCard | undefined {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  );
  return ratingOf(callId, cardId);
}

/** Tests only. */
export function resetRatings(): void {
  byCall = new Map();
  changed();
}
