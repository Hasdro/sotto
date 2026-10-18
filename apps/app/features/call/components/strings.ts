import type { CardSource, CardType } from "@sotto/shared";
import type { SuggestionCardStrings } from "@sotto/ui";
import type { StringKey, Vars } from "../../../lib/i18n";

type T = (key: StringKey, vars?: Vars) => string;

/** Localised labels for one card (DESIGN.md §5). */
export function cardStrings(t: T, type: CardType, source: CardSource): SuggestionCardStrings {
  return {
    type: t(`card.type.${type}`),
    source: t(`card.source.${source}`),
    notInPlaybook: t("card.notInPlaybook"),
    streaming: t("card.streaming"),
  };
}

/** mm:ss from milliseconds. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
