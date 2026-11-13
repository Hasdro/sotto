/**
 * Live-call strings added by the review round (T-072, D-041): kept here, not in lib/i18n.ts,
 * so this work merges cleanly with the copy pass that owns i18n.ts this wave. English and Arabic
 * in step (pattern of features/email/strings.ts).
 */
import type { Locale } from "../../lib/i18n";
import { useI18n } from "../../lib/locale";

const en = {
  /** The visible R2 line under an AI card's sentence (UX-12). */
  "card.notInPlaybookShort": "Not in playbook — check first",
  /** UX-13: older cards beyond the first two. */
  "card.showEarlier": "Show earlier ({count})",
  "card.showFewer": "Show fewer",
  /** UX-06a: the only mode word in the header, on practice calls. */
  "call.practice": "Practice",
  /** UX-15: the visible label of the context-rail toggle. */
  "call.rail.label": "Context",
  /** UX-02: the thumbs' group name (no visible question). */
  "rating.group": "Rate this suggestion",
} as const;

export type CallTextKey = keyof typeof en;

const ar: Record<CallTextKey, string> = {
  "card.notInPlaybookShort": "ليست في الدليل — تأكد أولاً",
  "card.showEarlier": "عرض الأقدم ({count})",
  "card.showFewer": "عرض أقل",
  "call.practice": "تدريب",
  "call.rail.label": "السياق",
  "rating.group": "قيّم هذا الاقتراح",
};

export const CALL_TEXT: Record<Locale, Record<CallTextKey, string>> = { en, ar };

export function useCallText(): (key: CallTextKey, vars?: Record<string, string>) => string {
  const { locale } = useI18n();
  return (key, vars) =>
    Object.entries(vars ?? {}).reduce(
      (s, [k, v]) => s.split(`{${k}}`).join(v),
      CALL_TEXT[locale][key] as string,
    );
}
