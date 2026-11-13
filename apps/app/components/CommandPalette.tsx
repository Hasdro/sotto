/**
 * ⌘K / Ctrl+K quick search (owner, 22 Oct: in the spirit of the Claude desktop app): type to jump
 * to any section, a common action or a recent call; Enter opens the first match. Web and desktop.
 */
import {
  Icon,
  type IconName,
  radius,
  space,
  Text,
  TextField,
  useGlassStyle,
  useTheme,
} from "@sotto/ui";
import { type Href, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { deviceCalls } from "../lib/deviceHistory";
import type { StringKey } from "../lib/i18n";
import { useI18n } from "../lib/locale";
import { setPrefs } from "../lib/prefs";

export type Command = { id: string; icon: IconName; label: string; href: Href; run?: () => void };

/** Commands whose label contains every word typed, in any order. Pure; exported for tests. */
export function filterCommands(all: readonly Command[], query: string): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return all.filter((c) => words.every((w) => c.label.toLowerCase().includes(w)));
}

export function CommandPalette({
  sections,
}: {
  sections: readonly { href: Href; icon: IconName; label: StringKey }[];
}) {
  const { t } = useI18n();
  const { color } = useTheme();
  const glass = useGlassStyle({ elevated: true });
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuery("");
        setOpen((v) => !v);
      } else if (e.key === "Escape") setOpen(false);
    };
    const doc = (globalThis as { document?: Document }).document;
    doc?.addEventListener("keydown", onKey);
    return () => doc?.removeEventListener("keydown", onKey);
  }, []);

  const all = useMemo<Command[]>(() => {
    if (!open) return [];
    return [
      ...sections.map(
        (s): Command => ({
          id: `go-${String(s.href)}`,
          icon: s.icon,
          label: t(s.label),
          href: s.href,
        }),
      ),
      { id: "act-call", icon: "headphones", label: t("palette.listen"), href: "/call" },
      { id: "act-knowledge", icon: "spark", label: t("palette.knowledge"), href: "/settings" },
      {
        id: "act-tutorial",
        icon: "playbook",
        label: t("palette.tutorial"),
        href: "/home",
        run: () => setPrefs({ tutorialDone: false }),
      },
      ...deviceCalls()
        .slice(0, 8)
        .map(
          (c): Command => ({
            id: `call-${c.id}`,
            icon: "history",
            label: c.title,
            href: `/history/${c.id}` as Href,
          }),
        ),
    ];
  }, [open, sections, t]);
  const shown = filterCommands(all, query).slice(0, 12);
  const go = (c: Command | undefined) => {
    if (!c) return;
    setOpen(false);
    c.run?.();
    router.navigate(c.href);
  };
  if (!open) return null;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => setOpen(false)}>
      <Pressable
        style={[styles.scrim, { backgroundColor: `${color.scrim}66` }]}
        onPress={() => setOpen(false)}
        accessibilityLabel={t("nav.close")}
      />
      <View style={[styles.sheet, glass]} testID="palette" accessibilityViewIsModal>
        <TextField
          autoFocus
          accessibilityLabel={t("palette.search")}
          placeholder={t("palette.search")}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => go(shown[0])}
          testID="palette-input"
        />
        <View style={styles.list}>
          {shown.map((c, i) => (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              onPress={() => go(c)}
              testID={`palette-${c.id}`}
              style={(state) => [
                styles.item,
                i === 0 || (state as { hovered?: boolean }).hovered
                  ? { backgroundColor: color.surfaceSunken }
                  : null,
              ]}
            >
              <Icon name={c.icon} size={18} color={color.textMuted} />
              <Text numberOfLines={1} style={styles.grow}>
                {c.label}
              </Text>
              {i === 0 ? (
                <Text variant="label" tone="muted">
                  ↵
                </Text>
              ) : null}
            </Pressable>
          ))}
          {shown.length === 0 ? (
            <Text tone="muted" style={styles.none}>
              {t("palette.none")}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: StyleSheet.absoluteFill,
  sheet: {
    position: "absolute",
    top: "14%",
    alignSelf: "center",
    width: 560,
    maxWidth: "92%",
    padding: space.md,
    gap: space.sm,
    borderRadius: radius.sheet,
  },
  list: { gap: 2 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
  },
  grow: { flex: 1, minWidth: 0 },
  none: { padding: space.md },
});
