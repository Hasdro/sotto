/** A past card as the rating controls see it (UX-02h): finished, with a stable id per call. */
import type { CardView } from "../cards/reducer";
import type { PastCard } from "./mock";

export function pastCardView(callId: string, card: PastCard): CardView {
  return {
    id: card.id ?? `h-${card.atMs}-${card.type}`,
    callId,
    type: card.type,
    source: card.source,
    label: null,
    text: card.text,
    done: true,
    turnKey: "",
    firstSeenAt: 0,
    shownAfterMs: null,
    timing: null,
    chunks: {},
    doneSeq: null,
  };
}
