import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../theme.tsx";
import { minTouchTarget, radius, space } from "../tokens.ts";
import { isActivationKey, keyOf, useFocusRing } from "./focus.ts";
import { useGlassStyle } from "./glass.ts";
import { Text } from "./Text.tsx";

export type ToastAction = { label: string; onPress: () => void };

export type ToastProps = {
  title: string;
  body?: string | undefined;
  /** One short action, e.g. "Undo" (shown for `motion.undoMs`; the app times it out). */
  action?: ToastAction | undefined;
  testID?: string | undefined;
};

/**
 * A short confirmation (e.g. "Sent to your manager"). The app positions it and times it out.
 * Floating chrome, so it wears the glass layer on web (D-037): a paper slab with the float shadow
 * in light; a raised dark surface with a visible border in dark, so it never outshines the card
 * (UX-40).
 */
export function Toast({ title, body, action, testID }: ToastProps) {
  const { color } = useTheme();
  const glass = useGlassStyle();
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.toast,
        { backgroundColor: color.toastFill, borderColor: color.toastBorder },
        Platform.OS === "web" ? [glass, { borderColor: color.toastBorder }] : null,
      ]}
    >
      <View style={styles.text}>
        <Text variant="body" weight="medium" color={color.onToast}>
          {title}
        </Text>
        {body ? (
          <Text variant="label" color={color.onToast} numberOfLines={2}>
            {body}
          </Text>
        ) : null}
      </View>
      {action ? <Action action={action} testID={testID ? `${testID}-action` : undefined} /> : null}
    </View>
  );
}

function Action({ action, testID }: { action: ToastAction; testID?: string | undefined }) {
  const { color } = useTheme();
  const focus = useFocusRing();
  const onKeyDown = (e: unknown) => {
    if (Platform.OS !== "web" && isActivationKey(keyOf(e))) action.onPress();
  };
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      onPress={action.onPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      {...{ onKeyDown }}
      style={({ pressed }) => [styles.action, pressed ? styles.pressed : null, focus.ring]}
    >
      <Text variant="body" weight="semibold" color={color.onToast} style={styles.underline}>
        {action.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    paddingHorizontal: space.lg + 4,
    paddingVertical: space.md,
  },
  text: { flex: 1, gap: 2 },
  action: {
    minHeight: minTouchTarget,
    minWidth: minTouchTarget,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  underline: { textDecorationLine: "underline" },
  pressed: { opacity: 0.8 },
});
