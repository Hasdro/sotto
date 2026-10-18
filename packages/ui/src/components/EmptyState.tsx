import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme.tsx";
import { radius, space } from "../tokens.ts";
import { Button } from "./Button.tsx";
import { Text } from "./Text.tsx";

export type EmptyStateProps = {
  title: string;
  body?: string;
  /** A short code or command shown in a sunken box, e.g. "pnpm demo". */
  code?: string;
  action?: { label: string; onPress: () => void };
  testID?: string;
};

/** What to do next when there is nothing to show. Never a blank screen. */
export function EmptyState({ title, body, code, action, testID }: EmptyStateProps) {
  const { color } = useTheme();
  return (
    <View testID={testID} accessibilityRole="summary" style={styles.wrap}>
      <Text variant="heading" weight="semibold" accessibilityRole="header" style={styles.center}>
        {title}
      </Text>
      {body ? (
        <Text variant="body" tone="muted" style={styles.center}>
          {body}
        </Text>
      ) : null}
      {code ? (
        <View
          style={[styles.code, { backgroundColor: color.surfaceSunken, borderColor: color.border }]}
        >
          <Text variant="body" weight="medium" selectable>
            {code}
          </Text>
        </View>
      ) : null}
      {action ? <Button label={action.label} onPress={action.onPress} variant="secondary" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
    paddingVertical: space.xxl,
    paddingHorizontal: space.lg,
    maxWidth: 440,
    alignSelf: "center",
  },
  center: { textAlign: "center" },
  code: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
});
