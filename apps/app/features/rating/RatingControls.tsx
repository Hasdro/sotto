/**
 * Helpful / Not helpful under a finished AI advice card, then optional reason chips (T-058).
 * One quiet row, so the card stays the one thing to read (R8 density). Hidden for playbook,
 * holding and system cards, and whenever ratings are not available to this person.
 */
import { Icon, minTouchTarget, radius, space, Text, useTheme } from "@sotto/ui";
import { Pressable, StyleSheet, View } from "react-native";
import { useFeature } from "../../components/FeatureGate";
import { useI18n } from "../../lib/locale";
import type { CardView } from "../cards/reducer";
import {
  isRateable,
  type Rating,
  type RatingReason,
  REASONS_FOR,
  rateCard,
  useRating,
} from "./ratings";

export function RatingControls({ card }: { card: CardView }) {
  const { t } = useI18n();
  const feature = useFeature("card_ratings");
  const current = useRating(card.callId, card.id);
  if (!card.done || !isRateable(card) || feature.state !== "available") return null;
  const choose = (r: Rating) => rateCard(card, current?.rating === r ? null : r, []);
  const toggle = (reason: RatingReason) => {
    if (!current) return;
    const has = current.reasons.includes(reason);
    rateCard(
      card,
      current.rating,
      has ? current.reasons.filter((x) => x !== reason) : [...current.reasons, reason],
    );
  };
  return (
    <View
      style={styles.wrap}
      testID={`rating-${card.id}`}
      accessibilityRole="toolbar"
      accessibilityLabel={t("rating.prompt")}
    >
      <View style={styles.row}>
        <Pill
          testID={`rate-up-${card.id}`}
          icon="check"
          label={t("rating.up")}
          on={current?.rating === "up"}
          onPress={() => choose("up")}
        />
        <Pill
          testID={`rate-down-${card.id}`}
          icon="close"
          label={t("rating.down")}
          on={current?.rating === "down"}
          onPress={() => choose("down")}
        />
      </View>
      {current ? (
        <View style={styles.row} accessibilityLabel={t("rating.reasons")}>
          {REASONS_FOR[current.rating].map((reason) => (
            <Pill
              key={reason}
              testID={`reason-${reason}-${card.id}`}
              label={t(`rating.reason.${reason}`)}
              on={current.reasons.includes(reason)}
              onPress={() => toggle(reason)}
              small
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Pill({
  label,
  icon,
  on,
  onPress,
  small = false,
  testID,
}: {
  label: string;
  icon?: "check" | "close";
  on: boolean;
  onPress: () => void;
  small?: boolean;
  testID?: string;
}) {
  const { color } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole={small ? "checkbox" : "radio"}
      accessibilityState={small ? { checked: on } : { selected: on }}
      aria-checked={on}
      style={({ pressed }) => [
        styles.pill,
        {
          borderColor: on ? color.primary : color.border,
          backgroundColor: on ? color.surfaceSunken : "transparent",
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      {icon ? <Icon name={icon} size={16} color={on ? color.primary : color.textMuted} /> : null}
      <Text variant="label" weight={on ? "semibold" : "medium"} tone={on ? "primary" : "muted"}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, marginTop: -space.md },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  pill: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
