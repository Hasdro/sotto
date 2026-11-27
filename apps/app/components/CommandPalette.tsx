/**
 * ⌘K / Ctrl+K quick search (owner, 22 Oct: in the spirit of the Claude desktop app): type to jump
 * to any section, Admin page, Settings section, common action or recent call; Enter opens the
 * first match. Web and desktop; the sidebar's Search button opens it too (UX-001).
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
import { ADMIN_GROUPS, adminPageLabel } from "../features/admin/pages";
import { callTitle } from "../features/history/title";
import { scrollToAnchor } from "../lib/anchor";
import { deviceCalls } from "../lib/deviceHistory";
import { formatWhen } from "../lib/format";
import { type Locale, type StringKey, t as translate } from "../lib/i18n";
import { useI18n } from "../lib/locale";
import { setPrefs } from "../lib/prefs";
import { canOpen, useRole, type ViewRole } from "../lib/role";

export type Command = {
  id: string;
  icon: IconName;
  label: string;
  href: Href;
  /** Where it lives ("Admin · AI"); shown after the label and searched too. */
  hint?: string;
  /** Other words it answers to, in both languages; searched, never shown. */
  terms?: string;
  run?: () => void;
};

/** Commands whose label, place or search words contain every word typed, in any order. Pure;
 * exported for tests. */
export function filterCommands(all: readonly Command[], query: string): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return all.filter((c) => {
    const text = `${c.label} ${c.hint ?? ""} ${c.terms ?? ""}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

/** Settings sections with an anchor on the page (`/settings#id`). */
const SETTINGS_SECTIONS: readonly {
  id: string;
  label: StringKey;
  icon: IconName;
  terms: string;
}[] = [
  {
    id: "appearance",
    label: "settings.appearance",
    icon: "palette",
    terms: "theme dark light language arabic english المظهر اللغة الداكن الفاتح",
  },
  {
    id: "audio",
    label: "settings.audio",
    icon: "mic",
    terms: "microphone mic sound input speaker الميكروفون",
  },
  { id: "zoho", label: "settings.zoho", icon: "globe", terms: "zoho crm connect زوهو ربط" },
];

/**
 * UX-001: the Admin pages this role may open (R3 areas, so agents and managers never see one) and
 * the Settings sections, so "tone", "billing", "zoho" or "devices" lands on its page. The playbook
 * link in Admin is skipped: it is a section of its own. In Arabic the English name also matches,
 * since bilingual teams type either. Pure; exported for tests.
 */
export function deepCommands(
  role: ViewRole,
  t: (key: StringKey) => string,
  locale: Locale,
): Command[] {
  const admin = t("admin.title");
  const toEnglish = (key: StringKey) => translate(key, "en");
  const alsoEnglish = (name: string) => (locale === "en" ? "" : name);
  const pages = ADMIN_GROUPS.flatMap((group) =>
    group.pages
      .filter((page) => page.href.startsWith("/admin") && canOpen(role, page.href))
      .map(
        (page): Command => ({
          id: page.href === "/admin" ? "admin-team" : `admin-${page.href.slice("/admin/".length)}`,
          icon: page.icon,
          label: adminPageLabel(page, t, locale),
          hint: `${admin} · ${t(group.label)}`,
          terms: `${alsoEnglish(adminPageLabel(page, toEnglish, "en"))} ${page.terms ?? ""}`,
          href: page.href as Href,
        }),
      ),
  );
  const settings = t("nav.settings");
  const sections = SETTINGS_SECTIONS.map(
    (s): Command => ({
      id: `settings-${s.id}`,
      icon: s.icon,
      label: t(s.label),
      hint: settings,
      terms: `${alsoEnglish(toEnglish(s.label))} ${s.terms}`,
      href: `/settings#${s.id}` as Href,
    }),
  );
  return [...pages, ...sections];
}

/** The mounted palette's opener (one palette per app). */
const openers = new Set<() => void>();

/** Opens the quick search; the sidebar's Search button uses it (UX-001). */
export function openPalette(): void {
  for (const open of openers) open();
}

export function CommandPalette({
  sections,
}: {
  sections: readonly { href: Href; icon: IconName; label: StringKey }[];
}) {
  const { t, locale } = useI18n();
  const { role } = useRole();
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

  useEffect(() => {
    const opener = () => {
      setQuery("");
      setOpen(true);
    };
    openers.add(opener);
    return () => {
      openers.delete(opener);
    };
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
        // D-091: the old code only cleared tutorialDone, so it navigated and showed
        // nothing. An explicit request must set tutorialRequested.
        run: () => setPrefs({ tutorialDone: false, tutorialRequested: true }),
      },
      {
        id: "act-bug-report",
        icon: "message",
        label: t("palette.bug"),
        href: "/settings",
        run: () => setPrefs({ bugReportRequested: true }),
      },
      ...deepCommands(role, t, locale),
      ...deviceCalls()
        .slice(0, 8)
        .map(
          (c): Command => ({
            id: `call-${c.id}`,
            icon: "history",
            // UX-009: the call's name and when, as History shows them.
            label: `${callTitle(c.title, c.started_at, t)} · ${formatWhen(
              new Date(c.started_at).toISOString(),
              locale,
            )}`,
            href: `/history/${c.id}` as Href,
          }),
        ),
    ];
  }, [open, sections, t, role, locale]);
  const shown = filterCommands(all, query).slice(0, 12);
  const go = (c: Command | undefined) => {
    if (!c) return;
    setOpen(false);
    c.run?.();
    router.navigate(c.href);
    scrollToAnchor(c.href);
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
              {c.hint ? (
                <Text variant="label" tone="muted" numberOfLines={1} style={styles.hint}>
                  {c.hint}
                </Text>
              ) : null}
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
  hint: { flexShrink: 1, maxWidth: "45%" },
  none: { padding: space.md },
});
