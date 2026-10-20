import { Button, Panel, radius, size, space, Text, useTheme } from "@sotto/ui";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useI18n } from "../../../lib/locale";
import { useIsWide } from "../../../lib/responsive";
import type { AudioSource } from "../mic";

type Props = {
  /** The desktop app can hear the computer's sound (Zoom, Google Meet, softphones). */
  computer: boolean;
  onStart: (source: AudioSource) => void;
};

/**
 * Before a real call (D-024): where is the customer's voice? On the desktop the call app on this
 * computer is recommended (exact, R4); the microphone is for in-person and speakerphone calls.
 */
export function ListenStart({ computer, onStart }: Props) {
  const { t } = useI18n();
  const { color } = useTheme();
  const wide = useIsWide();
  const options: AudioSource[] = computer ? ["computer", "mic"] : ["mic"];
  const [picked, setPicked] = useState<AudioSource>(options[0] ?? "mic");
  return (
    <Panel style={[styles.panel, wide ? null : styles.panelNarrow]} testID="listen-start">
      <Text variant="title" weight="semibold" accessibilityRole="header">
        {t("call.listen.title")}
      </Text>
      <Text variant="body" tone="muted">
        {t("call.listen.body")}
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t("call.listen.where")}
        style={styles.list}
      >
        {options.map((s) => {
          const selected = s === picked;
          return (
            <Pressable
              key={s}
              accessibilityRole="radio"
              aria-checked={selected}
              onPress={() => setPicked(s)}
              testID={`source-${s}`}
              style={[
                styles.option,
                {
                  borderColor: selected ? color.primary : color.border,
                  backgroundColor: selected ? color.surfaceSunken : color.surface,
                },
              ]}
            >
              <View
                style={[
                  styles.radio,
                  { borderColor: selected ? color.primary : color.borderStrong },
                ]}
              >
                {selected ? (
                  <View style={[styles.radioDot, { backgroundColor: color.primary }]} />
                ) : null}
              </View>
              <View style={styles.optionText}>
                <Text variant="body" weight={selected ? "medium" : "regular"}>
                  {t(s === "computer" ? "call.listen.computer" : "call.listen.mic")}
                </Text>
                <Text variant="label" tone="muted">
                  {t(s === "computer" ? "call.listen.computerHint" : "call.listen.micHint")}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={[styles.actions, wide ? null : styles.actionsNarrow]}>
        <Button
          size="lg"
          label={t("call.listen.start")}
          onPress={() => onStart(picked)}
          testID="start-call"
        />
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space.md, padding: space.xl },
  panelNarrow: { padding: space.lg },
  list: { gap: space.sm },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: size.controlLg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  optionText: { flex: 1, gap: space.xs, minWidth: 0 },
  radio: {
    width: size.radio,
    height: size.radio,
    borderRadius: radius.pill,
    borderWidth: size.stroke,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: { width: size.radioDot, height: size.radioDot, borderRadius: radius.pill },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.sm },
  actionsNarrow: { flexDirection: "column", flexWrap: "nowrap", alignItems: "stretch" },
});
