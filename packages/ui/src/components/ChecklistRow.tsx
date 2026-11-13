/**
 * One step of a checklist (UX-01 enabler, the after-call list): a checkbox, a one-line summary
 * of what will happen, and an optional "Edit" disclosure that holds the full editor. The whole
 * summary is the checkbox's label, so the 44 pt target covers the text as well as the box.
 */
import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../theme.tsx";
import { minTouchTarget, radius, size, space } from "../tokens.ts";
import { Disclosure } from "./Disclosure.tsx";
import { isActivationKey, keyOf, useFocusRing } from "./focus.ts";
import { Icon } from "./Icon.tsx";
import { Text } from "./Text.tsx";

export type ChecklistRowProps = {
  checked: boolean;
  label: string;
  onToggle: (checked: boolean) => void;
  disabled?: boolean | undefined;
  /** Name of the Edit disclosure; the editor is `children`. */
  editLabel?: string | undefined;
  children?: ReactNode | undefined;
  testID?: string | undefined;
};

export function ChecklistRow({
  checked,
  label,
  onToggle,
  disabled = false,
  editLabel,
  children,
  testID,
}: ChecklistRowProps) {
  const { color } = useTheme();
  const focus = useFocusRing();
  const onKeyDown = (e: unknown) => {
    // react-native-web toggles a checkbox role on Space itself; other hosts need this.
    if (Platform.OS !== "web" && !disabled && isActivationKey(keyOf(e))) onToggle(!checked);
  };
  return (
    <View style={styles.wrap}>
      <View testID={testID} style={styles.row}>
        <Pressable
          testID={testID ? `${testID}-check` : undefined}
          accessibilityRole="checkbox"
          accessibilityLabel={label}
          accessibilityState={{ checked, disabled }}
          aria-checked={checked}
          disabled={disabled}
          onPress={() => onToggle(!checked)}
          onFocus={focus.onFocus}
          onBlur={focus.onBlur}
          {...{ onKeyDown }}
          style={({ pressed }) => [
            styles.check,
            pressed ? styles.pressed : null,
            disabled ? styles.disabled : null,
            focus.ring,
          ]}
        >
          <View
            style={[
              styles.box,
              checked
                ? { backgroundColor: color.primary, borderColor: color.primary }
                : { borderColor: color.borderStrong },
            ]}
          >
            {checked ? <Icon name="check" size={16} color={color.onPrimary} /> : null}
          </View>
          <Text variant="body" numberOfLines={1} style={styles.grow}>
            {label}
          </Text>
        </Pressable>
      </View>
      {editLabel && children ? (
        <View style={styles.edit}>
          <Disclosure title={editLabel} testID={testID ? `${testID}-edit` : undefined}>
            {children}
          </Disclosure>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  check: {
    flex: 1,
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderRadius: radius.lg,
    paddingHorizontal: space.xs,
  },
  box: {
    width: size.checkbox,
    height: size.checkbox,
    borderRadius: radius.sm,
    borderWidth: size.stroke,
    alignItems: "center",
    justifyContent: "center",
  },
  grow: { flexShrink: 1 },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },
  edit: { paddingStart: size.checkbox + space.md },
});
