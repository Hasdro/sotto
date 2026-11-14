/**
 * Before a practice call (D-073, `/call?practice=1`): what it is, that nothing is kept, and one
 * start. Works on every device: the script plays, no microphone is needed.
 */
import { Button, Mascot, Panel, space, Text } from "@sotto/ui";
import { StyleSheet, View } from "react-native";
import { useIsWide } from "../../../lib/responsive";
import { useCallText } from "../strings";

type Props = {
  /** False when the server's bundle has no practice script yet (an older server). */
  available: boolean;
  onStart: () => void;
  /** Leaves practice for the normal start screen. */
  onReal: () => void;
};

export function PracticeStart({ available, onStart, onReal }: Props) {
  const tc = useCallText();
  const wide = useIsWide();
  return (
    <Panel style={[styles.panel, wide ? null : styles.panelNarrow]} testID="practice-start">
      <View style={styles.head}>
        <Mascot state="idle" size={64} />
        <View style={styles.headText}>
          <Text variant="title" weight="semibold" accessibilityRole="header">
            {tc("practice.title")}
          </Text>
          <Text variant="body" tone="muted">
            {available ? tc("practice.body") : tc("practice.missing")}
          </Text>
        </View>
      </View>
      <View style={[styles.actions, wide ? null : styles.actionsNarrow]}>
        {available ? (
          <Button size="lg" label={tc("practice.start")} onPress={onStart} testID="practice-go" />
        ) : null}
        <Button
          variant="ghost"
          label={tc("practice.real")}
          onPress={onReal}
          testID="practice-real"
        />
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space.lg, padding: space.xl },
  panelNarrow: { padding: space.lg },
  head: { flexDirection: "row", alignItems: "center", gap: space.lg, flexWrap: "wrap" },
  headText: { flex: 1, gap: space.xs, minWidth: 220 },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.lg },
  actionsNarrow: { flexDirection: "column", flexWrap: "nowrap", alignItems: "stretch" },
});
