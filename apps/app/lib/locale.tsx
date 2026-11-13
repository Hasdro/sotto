/**
 * Locale state: the app language, its direction, and a `t` bound to it.
 *
 * Direction: the root view gets `direction: rtl|ltr` (Yoga on native, CSS on web) and on web the
 * <html> element gets `dir` and `lang`, so text shaping, logical styles (start/end) and screen
 * readers all follow the language. On native we also tell I18nManager so system UI matches
 * after the next launch (DESIGN.md §8).
 */
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { I18nManager, Platform } from "react-native";
import { directionOf, LOCALES, type Locale, type StringKey, t, type Vars } from "./i18n";

const STORAGE_KEY = "sotto.locale";

type LocaleContextValue = {
  locale: Locale;
  dir: "ltr" | "rtl";
  setLocale: (locale: Locale) => void;
  t: (key: StringKey, vars?: Vars) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

/** Web only: the language chosen last time on this browser (a per-viewer convenience). */
function storedLocale(): Locale | null {
  if (Platform.OS !== "web") return null;
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY);
    return LOCALES.find((l) => l === value) ?? null;
  } catch {
    return null; // storage blocked (private mode): fall back to the default
  }
}

/**
 * ZC A1: the first start follows the computer's language (Arabic when the OS asks for it,
 * otherwise English); the switch in Settings wins from then on.
 */
export function osLocale(): Locale {
  const nav = (globalThis as { navigator?: { languages?: readonly string[]; language?: string } })
    .navigator;
  let tags: readonly string[] = nav?.languages?.length
    ? nav.languages
    : nav?.language
      ? [nav.language]
      : [];
  if (tags.length === 0) {
    try {
      tags = [Intl.DateTimeFormat().resolvedOptions().locale];
    } catch {
      tags = [];
    }
  }
  const first = (tags[0] ?? "").toLowerCase();
  return LOCALES.find((l) => first === l || first.startsWith(`${l}-`)) ?? "en";
}

export function LocaleProvider({ initial, children }: { initial?: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => initial ?? storedLocale() ?? osLocale());
  const dir = directionOf(locale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    if (Platform.OS === "web") {
      try {
        globalThis.localStorage?.setItem(STORAGE_KEY, next);
      } catch {
        // storage blocked: the choice still applies for this visit
      }
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.documentElement.dir = dir;
      document.documentElement.lang = locale;
    } else if (Platform.OS !== "web") {
      I18nManager.allowRTL(true);
      I18nManager.forceRTL(dir === "rtl");
    }
  }, [dir, locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, dir, setLocale, t: (key, vars) => t(key, locale, vars) }),
    [locale, dir, setLocale],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/** The current locale. Outside a provider (unit tests of leaf components) it is English, LTR. */
export function useI18n(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (ctx) return ctx;
  return { locale: "en", dir: "ltr", setLocale: () => {}, t: (key, vars) => t(key, "en", vars) };
}
