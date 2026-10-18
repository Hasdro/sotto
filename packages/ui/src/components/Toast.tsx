import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme.tsx";
import { radius, space } from "../tokens.ts";
import { Text } from "./Text.tsx";

export type ToastProps = { title: string; body?: string; testID?: string };

/** A short confirmation (e.g. "Sent to your manager"). The app positions it and times it out. */
export function Toast({ title, body, testID }: ToastProps) {
  const { color } = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.toast, { backgroundColor: color.inverseSurface }]}
    >
      <Text variant="body" weight="semibold" tone="onInverse">
        {title}
      </Text>
      {body ? (
        <Text variant="label" tone="onInverse" numberOfLines={2}>
          {body}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: 2,
  },
});
