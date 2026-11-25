/**
 * Card ratings (R11, D-034, T-058; extended Round 4 A2): only AI advice cards are rateable.
 * Reason chips updated to Round 4 set (too_long, too_formal, wrong, not_relevant) while
 * mapping legacy `not_our_style` -> `too_formal` cleanly for backward compatibility.
 */
import type { CardSource, CardType } from "@sotto/shared";
import { useSyncExternalStore } from "react";
import { cloudActive, cloudApi } from "../../lib/cloud";

export const RATING_REASONS = [
  "too_long",
  "too_formal",
  "wrong",
  "not_relevant",
  "good_phrasing",
  "not_our_style",
] as const;
export type RatingReason = (typeof RATING_REASONS)[number];
export type CanonicalReason = "too_long" | "too_formal" | "wrong" | "not_relevant" | "good_phrasing";
export type Rating = "up" | "down";

/** Map legacy R11 reason names to Round 4 canonical reasons. */
export function normalizeReason(reason: RatingReason): CanonicalReason {
  return reason === "not_our_style" ? "too_formal" : reason;
}

/** Reason chips offered after each choice (Round 4 A2). */
export const REASONS_FOR: Record<Rating, readonly CanonicalReason[]> = {
  up: ["good_phrasing"],
  down: ["too_long", "too_formal", "wrong", "not_relevant"],
};

export type RatedCard = {
  cardId: string;
  callId: string;
  type: CardType;
  source: CardSource;
  text: string;
  rating: Rating;
  reasons: CanonicalReason[];
  note?: string;
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
  note?: string,
): void {
  if (!isRateable(card)) return;
  let call = byCall.get(card.callId);
  if (!call) {
    call = new Map();
    byCall.set(card.callId, call);
    if (byCall.size > KEPT_CALLS) byCall = new Map([...byCall].slice(-KEPT_CALLS));
  }
  const normalized = reasons.map(normalizeReason);
  const allowed = rating ? normalized.filter((r) => REASONS_FOR[rating].includes(r)) : [];
  const trimmedNote = note?.trim();
  if (rating) {
    call.set(card.id, {
      cardId: card.id,
      callId: card.callId,
      type: card.type,
      source: card.source,
      text: card.text,
      rating,
      reasons: [...new Set(allowed)],
      ...(trimmedNote ? { note: trimmedNote } : {}),
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
