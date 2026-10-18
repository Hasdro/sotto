/**
 * Card stream reducer (pure): turns card-protocol deltas into the cards the in-call screen shows.
 *
 * Rules (ENGINEERING §4, R1, R2):
 * - Deltas are grouped by `card_id` and ordered by `seq`; a repeated `(card_id, seq)` is ignored.
 * - The first delta of a card renders at once, whatever its seq; later deltas fill in around it.
 * - `done: true` closes a card. Deltas with a higher seq than the closing one are ignored.
 * - A turn is the stretch between two `turn_end` events. A non-holding card replaces any holding
 *   card of the same turn; a holding card that arrives after a real card of its turn is dropped.
 *
 * The card protocol has no turn id, so the turn is the client's count of `turn_end` events at the
 * moment a card's first delta arrives (gap reported to the lead).
 */
import type { CardMessage, CardSource, CardType } from "@sotto/shared";

/** Cards kept per call. Older ones are dropped; the screen shows far fewer. */
export const MAX_CARDS = 50;

export type CardTiming = NonNullable<CardMessage["timing"]>;

export type CardView = {
  id: string;
  callId: string;
  type: CardType;
  source: CardSource;
  label: string | null;
  /** All deltas received so far, in seq order. */
  text: string;
  done: boolean;
  /** Index of the turn this card belongs to (count of turn_end events seen before it). */
  turn: number;
  /** Client clock (ms) when the first delta arrived. */
  firstSeenAt: number;
  /** Client-side delay from the turn_end that opened this turn to the first delta, if known. */
  shownAfterMs: number | null;
  timing: CardTiming | null;
  /** seq → delta. */
  chunks: Readonly<Record<number, string>>;
  /** seq of the message that closed the card. */
  doneSeq: number | null;
};

export type CardsState = {
  /** Card ids, newest first. */
  order: readonly string[];
  byId: Readonly<Record<string, CardView>>;
  /** Number of turn_end events seen. */
  turn: number;
  /** Client clock of the last turn_end. */
  turnEndedAt: number | null;
  /** Ids replaced or evicted; late deltas for them are ignored. */
  retired: Readonly<Record<string, true>>;
};

export type CardsAction =
  | { type: "card"; card: CardMessage; now: number }
  | { type: "turn_end"; now: number }
  | { type: "reset" };

export const initialCardsState: CardsState = {
  order: [],
  byId: {},
  turn: 0,
  turnEndedAt: null,
  retired: {},
};

function joinChunks(chunks: Readonly<Record<number, string>>): string {
  return Object.keys(chunks)
    .map(Number)
    .sort((a, b) => a - b)
    .map((seq) => chunks[seq])
    .join("");
}

function isHolding(card: { type: CardType; source: CardSource }): boolean {
  return card.type === "holding" || card.source === "holding";
}

export function cardsReducer(state: CardsState, action: CardsAction): CardsState {
  switch (action.type) {
    case "reset":
      return initialCardsState;
    case "turn_end":
      return { ...state, turn: state.turn + 1, turnEndedAt: action.now };
    case "card":
      return applyCard(state, action.card, action.now);
  }
}

function applyCard(state: CardsState, msg: CardMessage, now: number): CardsState {
  if (state.retired[msg.card_id]) return state;
  const existing = state.byId[msg.card_id];
  return existing ? updateCard(state, existing, msg) : openCard(state, msg, now);
}

function openCard(state: CardsState, msg: CardMessage, now: number): CardsState {
  const turnCards = state.order
    .map((id) => state.byId[id])
    .filter((c): c is CardView => c !== undefined && c.turn === state.turn);

  if (isHolding(msg) && turnCards.some((c) => !isHolding(c))) {
    // The real answer already arrived for this turn; a late holding line would only distract.
    return { ...state, retired: { ...state.retired, [msg.card_id]: true } };
  }

  const card: CardView = {
    id: msg.card_id,
    callId: msg.call_id,
    type: msg.type,
    source: msg.source,
    label: msg.label ?? null,
    text: msg.delta,
    done: msg.done,
    turn: state.turn,
    firstSeenAt: now,
    shownAfterMs:
      state.turnEndedAt !== null && state.turn > 0 ? Math.max(0, now - state.turnEndedAt) : null,
    timing: msg.timing ?? null,
    chunks: { [msg.seq]: msg.delta },
    doneSeq: msg.done ? msg.seq : null,
  };

  const replaced = isHolding(card)
    ? new Set<string>()
    : new Set(turnCards.filter(isHolding).map((c) => c.id));

  let order = [card.id, ...state.order.filter((id) => !replaced.has(id))];
  const evicted = order.slice(MAX_CARDS);
  order = order.slice(0, MAX_CARDS);

  const byId: Record<string, CardView> = { ...state.byId, [card.id]: card };
  const retired: Record<string, true> = { ...state.retired };
  for (const id of [...replaced, ...evicted]) {
    delete byId[id];
    retired[id] = true;
  }
  return { ...state, order, byId, retired };
}

function updateCard(state: CardsState, card: CardView, msg: CardMessage): CardsState {
  if (msg.seq in card.chunks) return state; // duplicate (card_id, seq)
  if (card.doneSeq !== null && msg.seq > card.doneSeq) return state; // after the close
  let chunks: Record<number, string> = { ...card.chunks, [msg.seq]: msg.delta };
  if (msg.done) {
    // The closing seq is the last one; anything numbered after it was never part of the card.
    chunks = Object.fromEntries(Object.entries(chunks).filter(([seq]) => Number(seq) <= msg.seq));
  }
  const done = card.done || msg.done;
  const next: CardView = {
    ...card,
    type: msg.type,
    source: msg.source,
    label: msg.label ?? card.label,
    timing: msg.timing ?? card.timing,
    chunks,
    text: joinChunks(chunks),
    done,
    doneSeq: msg.done ? msg.seq : card.doneSeq,
  };
  return { ...state, byId: { ...state.byId, [card.id]: next } };
}

/** Cards newest first. */
export function selectCards(state: CardsState): CardView[] {
  return state.order.map((id) => state.byId[id]).filter((c): c is CardView => c !== undefined);
}
