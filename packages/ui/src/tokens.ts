/**
 * Design tokens: the only source of colour, spacing, radius, type and motion for the apps (CLAUDE.md).
 *
 * Direction "Prompter's box" (docs/DESIGN.md, P3.1/P3.2): quiet cool surfaces, one ink-teal brand
 * colour, and the suggestion card as the only loud thing on screen. Every key here is documented
 * in DESIGN.md §3; every text/fill pair the app uses is contrast-tested in tokens.test.ts.
 *
 * Pure data and maths only (no react-native import), so it runs under vitest and in any runtime.
 */

export type Hex = `#${string}`;

export const CARD_KINDS = [
  "answer",
  "question",
  "objection",
  "signal",
  "warning",
  "holding",
] as const;
export type CardKind = (typeof CARD_KINDS)[number];

/** fill: card background · text: main sentence · muted: meta line · accent: voice bar and icon disc. */
export type CardColors = { fill: Hex; text: Hex; muted: Hex; accent: Hex };

export type Theme = {
  color: {
    /** Page background behind everything. */
    background: Hex;
    /** Panels, sidebars, list rows. */
    surface: Hex;
    /** Inputs, the transcript pane, segmented-control tracks. */
    surfaceSunken: Hex;
    text: Hex;
    textMuted: Hex;
    /** Hairlines between rows and panels (decorative, no contrast floor). */
    border: Hex;
    /** Outlines of inputs and controls (WCAG 1.4.11: ≥ 3:1 on background and surface). */
    borderStrong: Hex;
    /** Brand ink: primary buttons, links, the active nav item, the wordmark. */
    primary: Hex;
    onPrimary: Hex;
    /** Keyboard focus ring (≥ 3:1 on background). */
    focus: Hex;
    /** End call, destructive actions. */
    danger: Hex;
    onDanger: Hex;
    /** Text for good/bad states, e.g. a benchmark that meets or misses R1. */
    positive: Hex;
    negative: Hex;
    /** Toasts. */
    inverseSurface: Hex;
    onInverseSurface: Hex;
    /** The R2 "Not in playbook — check before promising" label. */
    noticeFill: Hex;
    noticeText: Hex;
    noticeBorder: Hex;
    /** Behind a drawer or dialog, drawn at `scrimOpacity` (D-023). */
    scrim: Hex;
  };
  /** One colour per card type, so the agent recognises a card at a glance (RESEARCH §6). */
  card: Record<CardKind, CardColors>;
};

const light: Theme = {
  color: {
    background: "#f2f4f6",
    surface: "#ffffff",
    surfaceSunken: "#e7ebef",
    text: "#15212c",
    textMuted: "#4d5b69",
    border: "#d5dce3",
    borderStrong: "#7e8c99",
    primary: "#0b5f63",
    onPrimary: "#ffffff",
    focus: "#0b5f63",
    danger: "#b3261e",
    onDanger: "#ffffff",
    positive: "#1c6b3a",
    negative: "#a3261c",
    inverseSurface: "#1d2833",
    onInverseSurface: "#f2f5f8",
    noticeFill: "#fff1d6",
    noticeText: "#5a3a00",
    noticeBorder: "#a87418",
    scrim: "#0b1218",
  },
  card: {
    answer: { fill: "#d9efea", text: "#0a3a35", muted: "#2d5c56", accent: "#0e766b" },
    question: { fill: "#e2e6fa", text: "#1c2766", muted: "#3d4780", accent: "#3a4bbf" },
    objection: { fill: "#fbead0", text: "#4d2e00", muted: "#6a4a17", accent: "#9a5b00" },
    signal: { fill: "#efe4fb", text: "#3a1766", muted: "#55387d", accent: "#7a3fc4" },
    warning: { fill: "#fadfdb", text: "#5c150f", muted: "#7a3a33", accent: "#b7352a" },
    holding: { fill: "#e6eaee", text: "#24303b", muted: "#46525d", accent: "#56646f" },
  },
};

const dark: Theme = {
  color: {
    background: "#0e151c",
    surface: "#151f28",
    surfaceSunken: "#1c2833",
    text: "#e7edf2",
    textMuted: "#9ba9b6",
    border: "#26333f",
    borderStrong: "#6b7b8a",
    primary: "#5fc4bb",
    onPrimary: "#06221f",
    focus: "#5fc4bb",
    danger: "#f2766b",
    onDanger: "#2a0603",
    positive: "#6fd39a",
    negative: "#ff8c80",
    inverseSurface: "#e7edf2",
    onInverseSurface: "#15212c",
    noticeFill: "#3a2a08",
    noticeText: "#fbe3b0",
    noticeBorder: "#c9962f",
    scrim: "#000000",
  },
  card: {
    answer: { fill: "#0f302c", text: "#d0f1ea", muted: "#a6cfc8", accent: "#56c7b8" },
    question: { fill: "#1a2150", text: "#dce1ff", muted: "#b6beec", accent: "#8f9dff" },
    objection: { fill: "#38280c", text: "#fbe5c0", muted: "#d9c29b", accent: "#e7a53c" },
    signal: { fill: "#2a1846", text: "#ecdfff", muted: "#cbb6ec", accent: "#b88cff" },
    warning: { fill: "#3d1915", text: "#ffd9d3", muted: "#e5b3ac", accent: "#ff7c6e" },
    holding: { fill: "#1d2832", text: "#dde5ec", muted: "#b3c0cb", accent: "#93a3b1" },
  },
};

export const themes = { light, dark } as const;
export type ThemeName = keyof typeof themes;

/** 4-pt scale. Agent screens use lg and up between blocks; admin screens may use sm/md. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

/** Radius grows with the size of the thing: controls < panels < the hero card. */
export const radius = { sm: 6, md: 10, lg: 16, xl: 22, pill: 999 } as const;

/**
 * Readex Pro (Google Fonts, OFL): one family for Latin and Arabic, built for reading speed.
 * The app loads these files (apps/app/app/_layout.tsx); the names must match expo-google-fonts.
 */
export const fontFamily = {
  regular: "ReadexPro_400Regular",
  medium: "ReadexPro_500Medium",
  semibold: "ReadexPro_600SemiBold",
} as const;
export type FontWeightName = keyof typeof fontFamily;

/** Used on web until the font has loaded, and if it never does. */
export const webFontFallback = "system-ui, -apple-system, 'Segoe UI', Tahoma, Arial, sans-serif";

/** Card text is read at arm's length in one glance (ENGINEERING §11). */
export const type = {
  /** Admin tables, meta lines. Never on the in-call card's main sentence. */
  label: { fontSize: 13, lineHeight: 18 },
  body: { fontSize: 16, lineHeight: 24 },
  heading: { fontSize: 18, lineHeight: 26 },
  title: { fontSize: 24, lineHeight: 32 },
  /** Older (collapsed) suggestion cards. */
  cardCompact: { fontSize: 17, lineHeight: 25 },
  /** The hero suggestion at phone width. */
  card: { fontSize: 28, lineHeight: 38 },
  /** The hero suggestion from the wide breakpoint up. */
  cardWide: { fontSize: 36, lineHeight: 48 },
} as const;
export type TypeRole = keyof typeof type;

/** Minimum touch target in points (ENGINEERING §11). */
export const minTouchTarget = 44;

/** Opacity of the `scrim` colour behind a drawer or dialog. */
export const scrimOpacity = 0.45;

/** Motion never sits on the read path: card text appears with no animation (DESIGN.md §7). */
export const motion = { fast: 120, base: 200, toastMs: 8000 } as const;

/** Fixed sizes of small marks and strokes (DESIGN.md §3.4). */
export const size = {
  /** Thick strokes: holding-card outline, listening outline, radio ring. */
  stroke: 2,
  /** Compact-card bar and the listening mark's bars. */
  bar: 4,
  /** The hero card's voice bar. */
  voiceBar: 8,
  /** Badge and speaker-chip dots. */
  dot: 8,
  /** Icon discs: compact card, hero card. */
  iconSm: 20,
  iconMd: 28,
  radio: 20,
  radioDot: 10,
  /** Large controls (Button size="lg", scenario rows). */
  controlLg: 52,
  /** Height of the static listening mark. */
  listenMark: 24,
} as const;

export const layout = {
  /** At or above this window width the app uses the sidebar and two-column layouts. */
  wideBreakpoint: 900,
  /** The hero card slot keeps this height, so the first card causes no layout jump. */
  heroMinHeight: 200,
  toastMaxWidth: 420,
  sidebarWidth: 248,
  /** Phone navigation drawer: this wide, or 85 % of the window if that is less (D-023). */
  drawerMaxWidth: 300,
  /** Top bar with the menu button below the wide breakpoint. */
  topBarHeight: 56,
  transcriptWidth: 380,
  contentMaxWidth: 1180,
  /** Readable measure for prose and admin forms. */
  readableMaxWidth: 760,
} as const;

function luminance(hex: Hex): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

/** WCAG 2.x contrast ratio between two opaque #rrggbb colours. */
export function contrastRatio(a: Hex, b: Hex): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
