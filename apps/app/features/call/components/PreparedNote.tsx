import { Button, Panel, space, Text } from "@sotto/ui";
import { StyleSheet, View } from "react-native";
import { useAttachedState } from "../../crm/attached";
import { useCallText } from "../strings";

/**
 * UX-008: on a narrow window Home's "Prepare" lands on the start screen, not under a sheet that
 * covers the menu and Start listening. This line says the brief is ready and opens the context
 * on demand.
 */
export function PreparedNote({ onOpen }: { onOpen: () => void }) {
  const tc = useCallText();
  const { crm } = useAttachedState();
  const title = crm.kind === "attached" ? (crm.brief.meeting?.title.trim() ?? "") : "";
  return (
    <Panel testID="prepare-ready">
      <View style={styles.row}>
        <Text variant="label" style={styles.text}>
          {title ? tc("prep.readyLinked", { title }) : tc("prep.ready")}
        </Text>
        <Button
          variant="secondary"
          label={tc("prep.open")}
          onPress={onOpen}
          testID="prepare-open"
        />
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.md },
  text: { flexGrow: 1, flexShrink: 1, flexBasis: 180 },
});
