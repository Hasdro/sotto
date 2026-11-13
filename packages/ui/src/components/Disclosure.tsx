/**
 * Accessible expand/collapse (UX-01/UX-04 enabler). The header is a button with an expanded
 * state; Enter and Space toggle it (react-native-web does this for role="button"; the keydown
 * handler covers other hosts), Escape closes it. Closed, the chevron points to the inline end,
 * so it mirrors in RTL; open, it points down. Controlled (`open` + `onToggle`) or not.
 */
import { type ReactNode, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useDirection, useTheme } from "../theme.tsx";
import { minTouchTarget, radius, space } from "../tokens.ts";
import { isActivationKey, keyOf, useFocusRing } from "./focus.ts";
import { Icon } from "./Icon.tsx";
import { Text } from "./Text.tsx";

export type DisclosureProps = {
  title: string;
  /** A quiet line after the title, e.g. a count or the current value. */
  summary?: string | undefined;
  /** Controlled state; leave undefined to let the Disclosure keep its own. */
  open?: boolean | undefined;
  defaultOpen?: boolean | undefined;
  onToggle?: ((open: boolean) => void) | undefined;
  children?: ReactNode | undefined;
  testID?: string | undefined;
};

export function Disclosure({
  title,
  summary,
  open: controlled,
  defaultOpen = false,
  onToggle,
  children,
  testID,
}: DisclosureProps) {
  const { color } = useTheme();
  const dir = useDirection();
  const focus = useFocusRing();
  const [own, setOwn] = useState(defaultOpen);
  const open = controlled ?? own;
  const set = (next: boolean) => {
    if (controlled === undefined) setOwn(next);
    onToggle?.(next);
  };
  const onKeyDown = (e: unknown) => {
    const k = keyOf(e);
    if (k === "Escape" && open) set(false);
    // react-native-web already presses a role="button" on Enter/Space; avoid a double toggle.
    else if (Platform.OS !== "web" && isActivationKey(k)) set(!open);
  };
  const rotate = open ? "0deg" : dir === "rtl" ? "90deg" : "-90deg";
  return (
    <View testID={testID} style={styles.wrap}>
      <Pressable
        testID={testID ? `${testID}-toggle` : undefined}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={summary}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => set(!open)}
        onFocus={focus.onFocus}
        onBlur={focus.onBlur}
        {...{ onKeyDown }}
        style={({ pressed }) => [styles.head, pressed ? styles.pressed : null, focus.ring]}
      >
        <View testID={testID ? `${testID}-chevron` : undefined} style={{ transform: [{ rotate }] }}>
          <Icon name="chevron" size={18} color={color.textMuted} />
        </View>
        <Text variant="body" weight="medium" style={styles.grow}>
          {title}
        </Text>
        {summary ? (
          <Text variant="label" tone="muted" numberOfLines={1} style={styles.shrink}>
            {summary}
          </Text>
        ) : null}
      </Pressable>
      {open && children ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  head: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderRadius: radius.lg,
    paddingHorizontal: space.xs,
  },
  pressed: { opacity: 0.8 },
  grow: { flexGrow: 1, flexShrink: 1 },
  shrink: { flexShrink: 1 },
  body: { paddingStart: space.xl },
});
