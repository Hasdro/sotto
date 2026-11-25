/**
 * Thumbs up / down for a finished AI advice card (T-058, UX-02): two 44 pt icon buttons with
 * accessible names and no visible question, so the card stays the one thing to read. Reason
 * chips open only after a thumbs-down. Hidden for playbook, holding and system cards, and
 * whenever ratings are not available to this person. Where it shows (never under the live
 * hero; on collapsed cards on hover or focus; on every AI card after the call) is CardStack's
 * choice (draft D-042 (backlog)).
 */
import { IconButton, minTouchTarget, radius, space, Text, useTheme } from "@sotto/ui";
import { Pressable, StyleSheet, View } from "react-native";
import { useFeature } from "../../components/FeatureGate";
import { useI18n } from "../../lib/locale";
import { useCallText } from "../call/strings";
import type { CardView } from "../cards/reducer";
import { usePostCallText } from "../postcall/strings";
import {
  type CanonicalReason,
  isRateable,
  normalizeReason,
  type Rating,
  REASONS_FOR,
  rateCard,
  useRating,
} from "./ratings";

const REASON_KEY: Record<
  CanonicalReason,
  | "feedback.reason.too_long"
  | "feedback.reason.too_formal"
  | "feedback.reason.wrong"
  | "feedback.reason.not_relevant"
  | "feedback.reason.good_phrasing"
> = {
  too_long: "feedback.reason.too_long",
  too_formal: "feedback.reason.too_formal",
  wrong: "feedback.reason.wrong",
  not_relevant: "feedback.reason.not_relevant",
  good_phrasing: "feedback.reason.good_phrasing",
};

/** Whether the controls would render for this card (rateable, finished, ratings on). */
export function useCanRate(card: CardView): boolean {
  const feature = useFeature("card_ratings");
  return card.done && isRateable(card) && feature.state === "available";
}

export function RatingControls({
  card,
  onFocus,
  onBlur,
}: {
  card: CardView;
  /** Focus entering or leaving the buttons (CardStack keeps a collapsed card lit meanwhile). */
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const { t } = useI18n();
  const ct = useCallText();
  const ft = usePostCallText();
  const canRate = useCanRate(card);
  const current = useRating(card.callId, card.id);
  if (!canRate) return null;
  const choose = (r: Rating) => rateCard(card, current?.rating === r ? null : r, []);
  const toggle = (reason: CanonicalReason) => {
    if (!current) return;
    const normalized = current.reasons.map(normalizeReason);
    const has = normalized.includes(reason);
    rateCard(
      card,
      current.rating,
      has ? normalized.filter((x) => x !== reason) : [...normalized, reason],
    );
  };
  return (
    <View
      style={styles.wrap}
      testID={`rating-${card.id}`}
      accessibilityRole="toolbar"
      accessibilityLabel={ct("rating.group")}
    >
      <View style={styles.row}>
        <IconButton
          testID={`rate-up-${card.id}`}
          icon="check"
          label={t("rating.up")}
          selected={current?.rating === "up"}
          outlined
          onFocus={onFocus}
          onBlur={onBlur}
          onPress={() => choose("up")}
        />
        <IconButton
          testID={`rate-down-${card.id}`}
          icon="close"
          label={t("rating.down")}
          selected={current?.rating === "down"}
          outlined
          onFocus={onFocus}
          onBlur={onBlur}
          onPress={() => choose("down")}
        />
      </View>
      {current?.rating === "down" ? (
        <View style={styles.row} accessibilityLabel={t("rating.reasons")}>
          {REASONS_FOR.down.map((reason) => (
            <Chip
              key={reason}
              testID={`reason-${reason}-${card.id}`}
              label={ft(REASON_KEY[reason])}
              on={current.reasons.map(normalizeReason).includes(reason)}
              onPress={() => toggle(reason)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Chip({
  label,
  on,
  onPress,
  testID,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { color } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      aria-checked={on}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: on ? color.primary : color.border,
          backgroundColor: on ? color.surfaceSunken : "transparent",
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Text variant="label" weight={on ? "semibold" : "medium"} tone={on ? "primary" : "muted"}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
