/** A section that is still loading (FUNC-008, UI-013): a spinner and one muted line instead of
 * a blank area. Screen readers hear it as busy. */
import { Spinner, space, Text } from "@sotto/ui";
import { StyleSheet, View } from "react-native";

export function LoadingLine({ label, testID }: { label: string; testID?: string }) {
  return (
    <View
      style={styles.row}
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      aria-busy
      accessibilityLabel={label}
    >
      <Spinner />
      <Text variant="label" tone="muted">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.md },
});
