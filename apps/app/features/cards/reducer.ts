/**
 * Card stream reducer (pure): turns card-protocol deltas into the cards the in-call screen shows.
 *
 * Rules (ENGINEERING §4, R1, R2):
 * - Deltas are grouped by `card_id` and ordered by `seq`; a repeated `(card_id, seq)` is ignored.
 * - The first delta of a card renders at once, whatever its seq; later deltas fill in around it.
 * - `done: true` closes a card. Text already shown is never removed; after the close, deltas
 *   numbered above every seq received so far are ignored.
 * - A card's type and source are fixed by its first delta.
 * - Turns are keyed by the card's `turn_id` (the customer turn it answers). Only when it is
 *   absent does the client fall back to counting `turn_end` events. A non-holding card replaces
 *   the holding card of the same turn; a holding card is dropped only when its own turn already
 *   has a real card.
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
  /** The turn this card answers: its turn_id, or `n:<count of turn_end events>` without one. */
  turnKey: string;
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
  /** Client clock of each turn_end that carried a turn_id. */
  turnEnds: Readonly<Record<string, number>>;
  /** Ids replaced or evicted; late deltas for them are ignored. */
  retired: Readonly<Record<string, true>>;
};

export type CardsAction =
  | { type: "card"; card: CardMessage; now: number }
  | { type: "turn_end"; now: number; turnId?: string | null }
  | { type: "reset" };

export const initialCardsState: CardsState = {
  order: [],
  byId: {},
  turn: 0,
  turnEndedAt: null,
  turnEnds: {},
  retired: {},
};

/** turn_end times kept per call; older ones are dropped. */
const MAX_TURN_ENDS = 100;

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
    case "turn_end": {
      let turnEnds = state.turnEnds;
      if (action.turnId) {
        const kept = Object.entries(turnEnds).slice(-(MAX_TURN_ENDS - 1));
        turnEnds = { ...Object.fromEntries(kept), [action.turnId]: action.now };
      }
      return { ...state, turn: state.turn + 1, turnEndedAt: action.now, turnEnds };
    }
    case "card":
      return applyCard(state, action.card, action.now);
  }
}

function applyCard(state: CardsState, msg: CardMessage, now: number): CardsState {
  if (state.retired[msg.card_id]) return state;
  const existing = state.byId[msg.card_id];
  return existing ? updateCard(state, existing, msg) : openCard(state, msg, now);
}

function turnKeyOf(state: CardsState, msg: CardMessage): string {
  return msg.turn_id ?? `n:${state.turn}`;
}

function shownAfter(state: CardsState, msg: CardMessage, now: number): number | null {
  if (msg.turn_id) {
    const at = state.turnEnds[msg.turn_id];
    return at === undefined ? null : Math.max(0, now - at);
  }
  return state.turnEndedAt !== null && state.turn > 0 ? Math.max(0, now - state.turnEndedAt) : null;
}

function openCard(state: CardsState, msg: CardMessage, now: number): CardsState {
  const turnKey = turnKeyOf(state, msg);
  const turnCards = state.order
    .map((id) => state.byId[id])
    .filter((c): c is CardView => c !== undefined && c.turnKey === turnKey);

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
    turnKey,
    firstSeenAt: now,
    shownAfterMs: shownAfter(state, msg, now),
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
  const chunks: Record<number, string> = { ...card.chunks, [msg.seq]: msg.delta };
  // The close is at the highest seq seen, so a short `done` never removes text already shown.
  const doneSeq = msg.done ? Math.max(...Object.keys(chunks).map(Number)) : card.doneSeq;
  const next: CardView = {
    ...card,
    label: msg.label ?? card.label,
    timing: msg.timing ?? card.timing,
    chunks,
    text: joinChunks(chunks),
    done: card.done || msg.done,
    doneSeq,
  };
  return { ...state, byId: { ...state.byId, [card.id]: next } };
}

/** Cards newest first. */
export function selectCards(state: CardsState): CardView[] {
  return state.order.map((id) => state.byId[id]).filter((c): c is CardView => c !== undefined);
}
