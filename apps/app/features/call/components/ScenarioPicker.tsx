import { Button, Panel, radius, space, Text, useTheme } from "@sotto/ui";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useI18n } from "../../../lib/locale";
import type { Hello } from "../session";

type Props = { scenarios: Hello["scenarios"]; onStart: (scenarioId: string | null) => void };

/** Before a call: choose a scripted scenario, or start free and type the customer's lines. */
export function ScenarioPicker({ scenarios, onStart }: Props) {
  const { t } = useI18n();
  const { color } = useTheme();
  const [picked, setPicked] = useState<string | null>(scenarios[0]?.id ?? null);
  return (
    <Panel style={styles.panel} testID="scenario-picker">
      <Text variant="title" weight="semibold" accessibilityRole="header">
        {t("call.pick.title")}
      </Text>
      <Text variant="body" tone="muted">
        {t("call.pick.body")}
      </Text>
      {scenarios.length === 0 ? (
        <Text variant="body" tone="muted">
          {t("call.pick.empty")}
        </Text>
      ) : (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t("call.pick.scenarios")}
          style={styles.list}
        >
          {scenarios.map((s) => {
            const selected = s.id === picked;
            return (
              <Pressable
                key={s.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => setPicked(s.id)}
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
                <Text variant="body" weight={selected ? "medium" : "regular"}>
                  {s.title}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <View style={styles.actions}>
        {scenarios.length > 0 ? (
          <Button
            size="lg"
            label={t("call.pick.start")}
            onPress={() => onStart(picked)}
            testID="start-call"
          />
        ) : null}
        <Button
          size="lg"
          variant="secondary"
          label={t("call.pick.free")}
          onPress={() => onStart(null)}
        />
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space.md, padding: space.xl },
  list: { gap: space.sm },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 52,
    paddingHorizontal: space.lg,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: { width: 10, height: 10, borderRadius: radius.pill },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.sm },
});
