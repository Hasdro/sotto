/**
 * A single-select dropdown for lists longer than 4 options (D-093): SegmentedControl is
 * documented for 2–4 options and grows past the screen when the list does. A trigger shows
 * the chosen label; tapping it opens a Sheet with a search field and the options. The sheet
 * (not an in-flow list) is what keeps a long list usable on a narrow phone.
 */
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../theme.tsx";
import { minTouchTarget, radius, space } from "../tokens.ts";
import { Icon } from "./Icon.tsx";
import { Sheet } from "./Sheet.tsx";
import { Text } from "./Text.tsx";
import { TextField } from "./TextField.tsx";

export type DropdownOption<V extends string> = { value: V; label: string };

export type DropdownProps<V extends string> = {
  options: readonly DropdownOption<V>[];
  value: V;
  onChange: (value: V) => void;
  /** Accessible name of the trigger and the sheet. */
  accessibilityLabel: string;
  /** Text shown when the value matches no option. */
  placeholder?: string;
  /** Search field placeholder; English fallback when the app passes none. */
  searchPlaceholder?: string;
  /** Line shown when the search matches nothing. */
  emptyLabel?: string;
  testID?: string;
};

export function Dropdown<V extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  placeholder,
  searchPlaceholder = "Search",
  emptyLabel = "Nothing matches.",
  testID,
}: DropdownProps<V>) {
  const { color } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const chosen = options.find((o) => o.value === value);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);
  const disabled = options.length === 0;
  return (
    <View testID={testID}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
        aria-disabled={disabled}
        disabled={disabled}
        onPress={() => {
          setQuery("");
          setOpen(true);
        }}
        testID={testID ? `${testID}-trigger` : undefined}
        style={[
          styles.trigger,
          {
            backgroundColor: color.surface,
            borderColor: color.borderStrong,
          },
        ]}
      >
        <Text
          variant="body"
          tone={chosen ? "default" : "muted"}
          numberOfLines={1}
          style={styles.grow}
        >
          {chosen ? chosen.label : (placeholder ?? accessibilityLabel)}
        </Text>
        <Icon name="chevron" size={18} color={color.textMuted} />
      </Pressable>
      <Sheet
        open={open}
        title={accessibilityLabel}
        onClose={() => setOpen(false)}
        closeLabel={accessibilityLabel}
        testID={testID ? `${testID}-sheet` : undefined}
      >
        <TextField
          autoFocus
          accessibilityLabel={searchPlaceholder}
          placeholder={searchPlaceholder}
          value={query}
          onChangeText={setQuery}
          testID={testID ? `${testID}-search` : undefined}
        />
        {shown.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              aria-checked={selected}
              accessibilityLabel={o.label}
              onPress={() => {
                setOpen(false);
                onChange(o.value);
              }}
              testID={testID ? `${testID}-${o.value}` : undefined}
              style={[styles.item, selected ? { backgroundColor: color.surfaceSunken } : null]}
            >
              <Text variant="body" weight={selected ? "semibold" : "regular"} style={styles.grow}>
                {o.label}
              </Text>
              {selected ? <Icon name="check" size={18} color={color.primary} /> : null}
            </Pressable>
          );
        })}
        {shown.length === 0 ? (
          <Text tone="muted" style={styles.none}>
            {emptyLabel}
          </Text>
        ) : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  grow: { flex: 1, minWidth: 0 },
  item: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
  },
  none: { padding: space.md },
});
