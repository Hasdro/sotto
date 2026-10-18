import {
  Button,
  minTouchTarget,
  radius,
  SegmentedControl,
  size,
  space,
  Text,
  TextField,
  useTheme,
} from "@sotto/ui";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useI18n } from "../../../lib/locale";
import type { Speaker } from "../session";

type Props = {
  onSay: (speaker: Speaker, text: string) => boolean;
  disabled: boolean;
  /** Phone width: one row, with a tap-to-switch speaker chip instead of the segmented control. */
  compact?: boolean;
};

/**
 * Stands in for the microphone in the demo: type what the customer (or you) said. It sits at the
 * bottom of the screen so it is reachable with one thumb (DESIGN.md §5).
 */
export function Composer({ onSay, disabled, compact = false }: Props) {
  const { t } = useI18n();
  const { color } = useTheme();
  const [speaker, setSpeaker] = useState<Speaker>("customer");
  const [text, setText] = useState("");
  const submit = () => {
    const line = text.trim();
    if (!line || disabled) return;
    if (onSay(speaker, line)) setText("");
  };
  const speakerLabel = t(speaker === "customer" ? "call.speaker.customer" : "call.speaker.agent");
  const field = (
    <TextField
      accessibilityLabel={t("call.composer.label")}
      placeholder={t(
        speaker === "customer"
          ? "call.composer.customerPlaceholder"
          : "call.composer.agentPlaceholder",
      )}
      value={text}
      onChangeText={setText}
      onSubmitEditing={submit}
      returnKeyType="send"
      editable={!disabled}
      maxLength={2000}
      testID="composer-input"
    />
  );
  const send = (
    <Button
      label={t("call.composer.send")}
      onPress={submit}
      disabled={disabled || text.trim() === ""}
      testID="composer-send"
    />
  );
  return (
    <View style={[styles.wrap, { borderTopColor: color.border, backgroundColor: color.surface }]}>
      {compact ? (
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t("call.composer.who")}: ${speakerLabel}`}
            onPress={() => setSpeaker((s) => (s === "customer" ? "agent" : "customer"))}
            testID="speaker-toggle"
            style={[
              styles.chip,
              { borderColor: color.borderStrong, backgroundColor: color.surface },
            ]}
          >
            <View
              style={[
                styles.chipDot,
                { backgroundColor: speaker === "customer" ? color.primary : color.textMuted },
              ]}
            />
            <Text
              variant="label"
              weight="semibold"
              tone={speaker === "customer" ? "primary" : "muted"}
            >
              {speakerLabel}
            </Text>
          </Pressable>
          {field}
          {send}
        </View>
      ) : (
        <>
          <SegmentedControl
            accessibilityLabel={t("call.composer.who")}
            options={[
              { value: "customer", label: t("call.speaker.customer") },
              { value: "agent", label: t("call.speaker.agent") },
            ]}
            value={speaker}
            onChange={setSpeaker}
            testID="speaker"
          />
          <View style={styles.row}>
            {field}
            {send}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, padding: space.md, borderTopWidth: 1 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  chip: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  chipDot: { width: size.dot, height: size.dot, borderRadius: radius.pill },
});
