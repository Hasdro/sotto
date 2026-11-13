/**
 * Design tokens: the only source of colour, spacing, radius, type and motion for the apps (CLAUDE.md).
 *
 * Direction "Quiet Paper Glass" (D-037, docs/design/DESIGN-SYSTEM.md), from the owner's muse-ai
 * reference (docs/design/reference/muse-ai): a near-white canvas, flat cool-gray surfaces, pill
 * controls, translucent glass on floating chrome only, one blue accent, one sans family at
 * 400/500/600. The live suggestion card is the one place the accent is large (DESIGN-SYSTEM §5.3).
 * Every text/fill pair the app uses is contrast-tested in tokens.test.ts.
 *
 * `packages/ui/tokens.css` mirrors these values as CSS custom properties for the HTML surfaces
 * (owner console, Zoho pages, landing); tokens.test.ts keeps the two in step.
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

/**
 * The cool neutral ramp from the reference (muse `ai-gray`, 025–1100). Every neutral in both
 * themes is a step of this ramp; dark mode is derived from it (the reference has no dark theme).
 */
export const gray = {
  25: "#fafafa",
  50: "#f3f4f5",
  75: "#eeeff0",
  100: "#e9eaeb",
  150: "#e0e2e4",
  200: "#d1d3d5",
  250: "#c4c6c9",
  300: "#b5b7bb",
  400: "#a1a4a8",
  500: "#8f9296",
  550: "#818487",
  600: "#717477",
  650: "#686a6e",
  700: "#5c5e61",
  800: "#4b4d4f",
  900: "#383b3d",
  950: "#323435",
  1000: "#28292b",
  1050: "#1f1f20",
  1075: "#181819",
  1100: "#111112",
} as const satisfies Record<number, Hex>;

/**
 * fill: compact-card and badge fill (neutral) · text: sentence on fill · muted: meta line on fill ·
 * accent: the type's semantic hue, used only small (compact bar, icon disc, badge dot).
 * heroFill / heroText / heroMuted: the live hero card. It is the one large use of the accent
 * blue (the single primary thing in the live view); warning is the one semantic exception (red,
 * for safety); holding stays a pale neutral because it is provisional.
 */
export type CardColors = {
  fill: Hex;
  text: Hex;
  muted: Hex;
  accent: Hex;
  heroFill: Hex;
  heroText: Hex;
  heroMuted: Hex;
};

export type Theme = {
  color: {
    /** Page background behind everything. */
    background: Hex;
    /** Panels, sidebars, list rows. */
    surface: Hex;
    /** Neutral fills: inputs, chips, hover rows, segmented-control tracks (muse `--fill-secondary`). */
    surfaceSunken: Hex;
    /** The flat message-bubble gray: customer transcript lines, link cards (muse `bubbleAssistant`). */
    bubble: Hex;
    text: Hex;
    textMuted: Hex;
    /** Decorative only (placeholders in skeletons, disabled glyphs). Never carries meaning: < 4.5:1. */
    textTertiary: Hex;
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
    /** Inverted fill (light theme toasts). */
    inverseSurface: Hex;
    onInverseSurface: Hex;
    /** One step above `surface`: sheets, popovers, the dark toast (UX-40). */
    surfaceRaised: Hex;
    /** Toasts: inverted in light; a raised dark surface with a border in dark (UX-40). */
    toastFill: Hex;
    onToast: Hex;
    toastBorder: Hex;
    /** The R2 "Not in playbook — check before promising" label. */
    noticeFill: Hex;
    noticeText: Hex;
    noticeBorder: Hex;
    /** Behind a drawer or dialog, drawn at `scrimOpacity` (D-023). */
    scrim: Hex;
    /**
     * Small status marks in the accent family (D-037): the live dot, unread dots, "now" marks, the
     * active-state tick. `signal` is text-safe on background and surface; `signalFill` is its tint.
     */
    signal: Hex;
    signalFill: Hex;
    onSignalFill: Hex;
  };
  /** Per card type: a neutral fill plus one small semantic hue (icon disc, bar, badge dot). */
  card: Record<CardKind, CardColors>;
  /** Transcript bubbles: the customer and the agent at a glance (owner, 22 Oct). */
  speaker: Record<"customer" | "agent", { fill: Hex; text: Hex; label: Hex }>;
  /**
   * Floating chrome only (header pills, composer, toasts, sheets, the search field): translucent
   * fill + backdrop blur + the float shadow. `fallback` is the opaque colour where blur is not
   * supported (native, old browsers). Content cards, rows and bubbles never use glass.
   */
  glass: { fill: string; fallback: Hex; ring: string; shadow: string; shadowElevated: string };
};

const light: Theme = {
  color: {
    background: "#fcfcfc",
    surface: "#ffffff",
    surfaceSunken: "#f3f4f5",
    bubble: "#e9eaeb",
    text: "#111112",
    textMuted: "#5c5e61",
    textTertiary: "#989b9e",
    border: "#e0e2e4",
    borderStrong: "#818487",
    primary: "#005bbf",
    onPrimary: "#ffffff",
    focus: "#005bbf",
    danger: "#cb0021",
    onDanger: "#ffffff",
    positive: "#1a7f37",
    negative: "#cb0021",
    inverseSurface: "#28292b",
    onInverseSurface: "#f3f4f5",
    surfaceRaised: "#ffffff",
    toastFill: "#ffffff",
    onToast: "#111112",
    toastBorder: "#e0e2e4",
    noticeFill: "#fdf1dc",
    noticeText: "#6b3d00",
    noticeBorder: "#8a5300",
    scrim: "#111112",
    signal: "#0064d4",
    signalFill: "#e6f0fb",
    onSignalFill: "#00408a",
  },
  card: {
    answer: {
      fill: "#f3f4f5",
      text: "#111112",
      muted: "#5c5e61",
      accent: "#1a7f37",
      heroFill: "#005bbf",
      heroText: "#ffffff",
      heroMuted: "#d6e6fa",
    },
    question: {
      fill: "#f3f4f5",
      text: "#111112",
      muted: "#5c5e61",
      accent: "#005bbf",
      heroFill: "#005bbf",
      heroText: "#ffffff",
      heroMuted: "#d6e6fa",
    },
    objection: {
      fill: "#f3f4f5",
      text: "#111112",
      muted: "#5c5e61",
      accent: "#a15c00",
      heroFill: "#005bbf",
      heroText: "#ffffff",
      heroMuted: "#d6e6fa",
    },
    signal: {
      fill: "#f3f4f5",
      text: "#111112",
      muted: "#5c5e61",
      accent: "#6d3fc0",
      heroFill: "#005bbf",
      heroText: "#ffffff",
      heroMuted: "#d6e6fa",
    },
    warning: {
      fill: "#f3f4f5",
      text: "#111112",
      muted: "#5c5e61",
      accent: "#cb0021",
      heroFill: "#cb0021",
      heroText: "#ffffff",
      heroMuted: "#ffe4e6",
    },
    holding: {
      fill: "#f3f4f5",
      text: "#111112",
      muted: "#5c5e61",
      accent: "#5c5e61",
      heroFill: "#f3f4f5",
      heroText: "#111112",
      heroMuted: "#5c5e61",
    },
  },
  speaker: {
    customer: { fill: "#e9eaeb", text: "#111112", label: "#005bbf" },
    agent: { fill: "#f3f4f5", text: "#111112", label: "#5c5e61" },
  },
  glass: {
    fill: "rgba(255, 255, 255, 0.76)",
    fallback: "#ffffff",
    ring: "rgba(17, 17, 18, 0.08)",
    shadow: "0px 8px 40px 0px rgba(0, 0, 0, 0.12)",
    shadowElevated: "0px 2px 8px 0px rgba(0, 0, 0, 0.06), 0px 20px 50px 0px rgba(0, 0, 0, 0.14)",
  },
};

/** Derived from the gray ramp (the reference has no dark theme): same radii, same glass logic. */
const dark: Theme = {
  color: {
    background: "#111112",
    surface: "#181819",
    surfaceSunken: "#1f1f20",
    bubble: "#323435",
    text: "#f3f4f5",
    textMuted: "#a1a4a8",
    textTertiary: "#686a6e",
    border: "#323435",
    borderStrong: "#818487",
    primary: "#6aa8f7",
    onPrimary: "#0b1a2e",
    focus: "#6aa8f7",
    danger: "#ff7a85",
    onDanger: "#2a0608",
    positive: "#4cc38a",
    negative: "#ff7a85",
    inverseSurface: "#f3f4f5",
    onInverseSurface: "#111112",
    surfaceRaised: "#28292b",
    toastFill: "#28292b",
    onToast: "#f3f4f5",
    toastBorder: "#818487",
    noticeFill: "#3a2a08",
    noticeText: "#fbe3b0",
    noticeBorder: "#f3c76a",
    scrim: "#000000",
    signal: "#6aa8f7",
    signalFill: "#1c2d45",
    onSignalFill: "#cfe2fb",
  },
  card: {
    answer: {
      fill: "#28292b",
      text: "#f3f4f5",
      muted: "#a1a4a8",
      accent: "#4cc38a",
      heroFill: "#2a6ccb",
      heroText: "#ffffff",
      heroMuted: "#eef4fd",
    },
    question: {
      fill: "#28292b",
      text: "#f3f4f5",
      muted: "#a1a4a8",
      accent: "#6aa8f7",
      heroFill: "#2a6ccb",
      heroText: "#ffffff",
      heroMuted: "#eef4fd",
    },
    objection: {
      fill: "#28292b",
      text: "#f3f4f5",
      muted: "#a1a4a8",
      accent: "#e5a54b",
      heroFill: "#2a6ccb",
      heroText: "#ffffff",
      heroMuted: "#eef4fd",
    },
    signal: {
      fill: "#28292b",
      text: "#f3f4f5",
      muted: "#a1a4a8",
      accent: "#b08cf5",
      heroFill: "#2a6ccb",
      heroText: "#ffffff",
      heroMuted: "#eef4fd",
    },
    warning: {
      fill: "#28292b",
      text: "#f3f4f5",
      muted: "#a1a4a8",
      accent: "#ff7a85",
      heroFill: "#c0303f",
      heroText: "#ffffff",
      heroMuted: "#ffe4e6",
    },
    holding: {
      fill: "#28292b",
      text: "#f3f4f5",
      muted: "#a1a4a8",
      accent: "#a1a4a8",
      heroFill: "#28292b",
      heroText: "#f3f4f5",
      heroMuted: "#a1a4a8",
    },
  },
  speaker: {
    customer: { fill: "#323435", text: "#f3f4f5", label: "#6aa8f7" },
    agent: { fill: "#1f1f20", text: "#f3f4f5", label: "#a1a4a8" },
  },
  glass: {
    fill: "rgba(24, 24, 25, 0.76)",
    fallback: "#181819",
    ring: "rgba(255, 255, 255, 0.08)",
    shadow: "0px 8px 40px 0px rgba(0, 0, 0, 0.48)",
    shadowElevated: "0px 2px 8px 0px rgba(0, 0, 0, 0.32), 0px 20px 50px 0px rgba(0, 0, 0, 0.56)",
  },
};

export const themes = { light, dark } as const;
export type ThemeName = keyof typeof themes;

/** 4-pt grid (reference: --spacing 4px). Agent screens use lg and up between blocks. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

/**
 * Reference radii: pill controls, 22 px bubbles with one 6 px tail corner, 10 px link cards,
 * 12 px nav rows, 32 px composer capsule, 24 px overlay sheets.
 */
export const radius = {
  /** The bubble's tail corner; small tags. */
  sm: 6,
  /** Link cards, table frames, inputs inside dense admin forms. */
  md: 10,
  /** Sidebar nav rows, list rows on hover, compact cards. */
  lg: 12,
  /** Message bubbles, the hero suggestion card, outlined content cards. */
  xl: 22,
  /** Overlay sheets and dialogs. */
  sheet: 24,
  /** The composer / large input capsule. */
  composer: 32,
  pill: 999,
} as const;

/**
 * One family per script, both neutral grotesques at 400/500/600 (no 700): Inter for Latin (the
 * reference's first-listed open stand-in) and IBM Plex Sans Arabic for Arabic, whose x-height and
 * stroke weight sit well beside Inter. The app loads these files (apps/app/app/_layout.tsx); the
 * names must match expo-google-fonts. On web the Arabic face follows the Latin one in the stack,
 * so mixed Arabic/English lines pick the right face per glyph.
 */
export const fontFamily = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
} as const;
export type FontWeightName = keyof typeof fontFamily;

export const arabicFontFamily = {
  regular: "IBMPlexSansArabic_400Regular",
  medium: "IBMPlexSansArabic_500Medium",
  semibold: "IBMPlexSansArabic_600SemiBold",
} as const satisfies Record<FontWeightName, string>;

/** Used on web until the fonts have loaded, and if they never do. */
export const webFontFallback =
  "Inter, 'IBM Plex Sans Arabic', system-ui, -apple-system, 'Segoe UI', Tahoma, Arial, sans-serif";

/**
 * The reference scale (size / line height px). Line heights are kept where Arabic needs room
 * (body 24, headings ≥ 26). Card roles are this product's addition: read at arm's length.
 */
export const type = {
  /** 12/16: timestamps, tiny meta. */
  timestamp: { fontSize: 12, lineHeight: 16 },
  /** 13/18 caption: meta lines, badges, table headers. Never the card sentence. */
  label: { fontSize: 13, lineHeight: 18 },
  /** 14/20: secondary text, button labels, dense admin cells. */
  secondary: { fontSize: 14, lineHeight: 20 },
  body: { fontSize: 16, lineHeight: 24 },
  /** 18/26: section headings (w600) and lead paragraphs (w400). */
  heading: { fontSize: 18, lineHeight: 26 },
  /** 24/32: sheet titles, stat values. */
  title: { fontSize: 24, lineHeight: 32 },
  /** 34/40 w600: the one page title per screen. */
  pageTitle: { fontSize: 34, lineHeight: 42 },
  /** 48/56 w500, −0.01em: landing hero only. */
  display: { fontSize: 48, lineHeight: 56 },
  /** Older (collapsed) suggestion cards. */
  cardCompact: { fontSize: 17, lineHeight: 25 },
  /** The hero suggestion at phone width. */
  card: { fontSize: 28, lineHeight: 38 },
  /** The hero suggestion from the wide breakpoint up. */
  cardWide: { fontSize: 36, lineHeight: 48 },
} as const;
export type TypeRole = keyof typeof type;

/** Minimum touch target in points (ENGINEERING §11). Pills draw 36 px inside a 44 px target. */
export const minTouchTarget = 44;

/** Visual height of a pill control (reference: 36 px); the hit area stays `minTouchTarget`. */
export const controlHeight = 36;

/** Opacity of the `scrim` colour behind a drawer or dialog: light, so the page reads through. */
export const scrimOpacity = 0.24;

/** Backdrop blur of the glass layer, in px (reference: blur(36px)). */
export const glassBlur = 36;

/**
 * Reference timings: 100 ms fine feedback, 150 ms colour/opacity/transform, 200 ms
 * background/shadow, 300 ms layout. Motion never sits on the read path: card text appears with
 * no animation (DESIGN-SYSTEM §6).
 */
export const motion = {
  fast: 100,
  base: 150,
  medium: 200,
  layout: 300,
  toastMs: 8000,
  undoMs: 5000,
} as const;

/** Easing curves (CSS cubic-bezier strings; RN Animated uses Easing.bezier with the same numbers). */
export const easing = {
  standard: "cubic-bezier(0.4, 0, 0.2, 1)",
  out: "cubic-bezier(0, 0, 0.2, 1)",
  in: "cubic-bezier(0.4, 0, 1, 1)",
} as const;

export const size = {
  /** Thick strokes: holding-card outline, listening outline, radio ring. */
  stroke: 2,
  /** Compact-card bar and the listening mark's bars. */
  bar: 4,
  /** The hero card's voice bar (kept for API; the muse card has no bar, see SuggestionCard). */
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
  /** Keyboard focus ring: width and gap from the control (UX-44a). */
  focusRing: 2,
  focusOffset: 2,
  /** Checkbox square in ChecklistRow. */
  checkbox: 22,
  /** Round list-row icon and the icon-button hover circle (reference: 44 px). */
  rowIcon: 44,
  /** Inline icon size (reference: 16 px) and rail icon size. */
  iconInline: 16,
  iconRail: 24,
} as const;

export const layout = {
  /** At or above this window width the app uses the sidebar and two-column layouts. */
  wideBreakpoint: 900,
  /** The hero card slot keeps this height, so the first card causes no layout jump. */
  heroMinHeight: 200,
  toastMaxWidth: 420,
  /** Below this window width a Sheet is a bottom sheet; at or above it, a centred dialog. */
  sheetBreakpoint: 768,
  sheetMaxWidth: 560,
  sidebarWidth: 248,
  /** Icon rail (reference: 72 px). */
  railWidth: 72,
  /** Phone navigation drawer: this wide, or 85 % of the window if that is less (D-023). */
  drawerMaxWidth: 300,
  /** Top bar with the menu button below the wide breakpoint. */
  topBarHeight: 56,
  transcriptWidth: 380,
  contentMaxWidth: 1180,
  /** Readable measure for prose and admin forms (reference content column: 768). */
  readableMaxWidth: 768,
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
