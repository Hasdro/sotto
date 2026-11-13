/** History detail: what was saved and what was skipped after the call (UX-23). */
import { Icon, Panel, space, Text, useTheme } from "@sotto/ui";
import { StyleSheet, View } from "react-native";
import { type AfterCallItem, useAfterCall } from "../../lib/deviceHistory";
import { useReviewText } from "../review/strings";

export function AfterCallList({ callId }: { callId: string }) {
  const rt = useReviewText();
  const { color } = useTheme();
  const after = useAfterCall(callId);
  if (!after || (after.saved.length === 0 && after.skipped.length === 0)) return null;
  const group = (title: string, items: AfterCallItem[], id: string) =>
    items.length ? (
      <View style={styles.group} testID={`call-detail-${id}`}>
        <Text variant="label" weight="semibold" tone="muted">
          {title}
        </Text>
        {items.map((i) => (
          <Text key={i.id} variant="body">
            {i.label}
          </Text>
        ))}
      </View>
    ) : null;
  return (
    <Panel style={styles.panel} testID="call-detail-after">
      <View style={styles.title}>
        <Icon name="check" size={15} color={color.textMuted} />
        <Text variant="label" weight="medium" tone="muted" accessibilityRole="header">
          {rt("hist.after")}
        </Text>
      </View>
      {group(rt("hist.saved"), after.saved, "saved")}
      {group(rt("hist.skippedItems"), after.skipped, "skipped")}
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space.sm, marginBottom: space.xl },
  title: { flexDirection: "row", alignItems: "center", gap: 4 },
  group: { gap: 2 },
});
