import {
  Button,
  minTouchTarget,
  radius,
  SegmentedControl,
  size,
  space,
  Text,
  TextField,
  useGlassStyle,
  useTheme,
} from "@sotto/ui";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useI18n } from "../../../lib/locale";
import type { Speaker } from "../session";
import type { MicState } from "../useCallSession";

export type MicControl = { state: MicState; vendor: string; onToggle: () => void };

type Props = {
  onSay: (speaker: Speaker, text: string) => boolean;
  disabled: boolean;
  /** Present when the server has speech-to-text and this device can share its microphone. */
  mic?: MicControl | null;
  /** Words heard so far in the customer's current sentence. */
  partial?: string | null;
  /** Phone width: one row, with a tap-to-switch speaker chip instead of the segmented control. */
  compact?: boolean;
};

/**
 * Stands in for the microphone in the demo: type what the customer (or you) said. It sits at the
 * bottom of the screen so it is reachable with one thumb (DESIGN.md §5).
 */
export function Composer({ onSay, disabled, compact = false, mic = null, partial = null }: Props) {
  const { t } = useI18n();
  const { color } = useTheme();
  const glass = useGlassStyle();
  const [speaker, setSpeaker] = useState<Speaker>("customer");
  const [text, setText] = useState("");
  const submit = () => {
    const line = text.trim();
    if (!line || disabled) return;
    if (onSay(speaker, line)) setText("");
  };
  const speakerLabel = t(speaker === "customer" ? "call.speaker.customer" : "call.speaker.agent");
  const field = (
    <View style={styles.field}>
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
    </View>
  );
  const send = (
    <Button
      label={t("call.composer.send")}
      onPress={submit}
      disabled={disabled || text.trim() === ""}
      testID="composer-send"
    />
  );
  const micOn = mic?.state === "on" || mic?.state === "starting";
  const micRow = mic ? (
    <View style={styles.micRow}>
      <Button
        label={t(micOn ? "call.mic.stop" : "call.mic.start")}
        variant={micOn ? "danger" : "secondary"}
        onPress={mic.onToggle}
        disabled={disabled}
        testID="mic-toggle"
        leading={
          <View
            style={[styles.chipDot, { backgroundColor: micOn ? color.onDanger : color.primary }]}
          />
        }
      />
      <Text
        variant="label"
        tone={mic.state === "denied" || mic.state === "unsupported" ? "danger" : "muted"}
        style={styles.micHint}
      >
        {mic.state === "denied"
          ? t("call.mic.denied")
          : mic.state === "unsupported"
            ? t("call.mic.unsupported")
            : mic.state === "starting"
              ? t("call.mic.starting")
              : micOn
                ? t("call.mic.on", { vendor: mic.vendor })
                : t("call.mic.hint")}
      </Text>
    </View>
  ) : null;
  const hearing = partial ? (
    <Text
      variant="label"
      tone="muted"
      numberOfLines={2}
      testID="partial"
      accessibilityLiveRegion="polite"
    >
      {t("call.hearing", { text: partial })}
    </Text>
  ) : null;
  return (
    <View style={[styles.wrap, glass]}>
      {hearing}
      {micRow}
      {compact ? (
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t("call.composer.who")}: ${speakerLabel}`}
            onPress={() => setSpeaker((s) => (s === "customer" ? "agent" : "customer"))}
            testID="speaker-toggle"
            style={[styles.chip, { backgroundColor: color.surfaceSunken }]}
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
  // The composer capsule (DESIGN-SYSTEM §4.3, D-041): floating glass, 32 px radius, inset.
  wrap: {
    gap: space.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    margin: space.md,
    borderRadius: radius.composer,
  },
  row: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  field: { flex: 1, minWidth: 0 },
  chip: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
  },
  chipDot: { width: size.dot, height: size.dot, borderRadius: radius.pill },
  micRow: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  micHint: { flexShrink: 1 },
});
