/**
 * Design tokens: the only source of colour, spacing, radius and type for the apps (CLAUDE.md).
 *
 * STUB (P1.3): a neutral placeholder palette that already meets WCAG 2.2 AA in light and dark.
 * Phase 3 (P3.2/P3.3) replaces the values with the chosen visual direction; keep the key names
 * or change every consumer in the same PR.
 */

export type Hex = `#${string}`;

type CardColors = { fill: Hex; text: Hex; accent: Hex };

export type Theme = {
  color: {
    background: Hex;
    surface: Hex;
    text: Hex;
    textMuted: Hex;
    border: Hex;
    primary: Hex;
  };
  /** One colour per card type, so the agent recognises a card at a glance (RESEARCH §6). */
  card: Record<"answer" | "question" | "objection" | "warning" | "holding", CardColors>;
};

const light: Theme = {
  color: {
    background: "#ffffff",
    surface: "#f5f6f8",
    text: "#111418",
    textMuted: "#4a5260",
    border: "#d5d9e0",
    primary: "#1f5fd1",
  },
  card: {
    answer: { fill: "#e8f1ff", text: "#0d2f6b", accent: "#1f5fd1" },
    question: { fill: "#eef7ee", text: "#14401b", accent: "#2e7d32" },
    objection: { fill: "#fff4e5", text: "#5c3200", accent: "#b45f06" },
    warning: { fill: "#fdecec", text: "#6b1111", accent: "#c62828" },
    holding: { fill: "#f1f1f4", text: "#2a2d34", accent: "#5f6470" },
  },
};

const dark: Theme = {
  color: {
    background: "#0e1116",
    surface: "#171b22",
    text: "#eef1f5",
    textMuted: "#a9b1bd",
    border: "#2c323c",
    primary: "#7aa7ff",
  },
  card: {
    answer: { fill: "#132544", text: "#dce8ff", accent: "#7aa7ff" },
    question: { fill: "#13301a", text: "#d9f2dc", accent: "#6cc070" },
    objection: { fill: "#3a2408", text: "#ffe6c2", accent: "#f0a040" },
    warning: { fill: "#3d1414", text: "#ffd9d9", accent: "#ff7070" },
    holding: { fill: "#22252c", text: "#e4e6ea", accent: "#a0a6b2" },
  },
};

export const themes = { light, dark } as const;
export type ThemeName = keyof typeof themes;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 16 } as const;
/** Card text is read at arm's length in one glance (ENGINEERING §11). */
export const type = {
  body: { fontSize: 16, lineHeight: 24 },
  label: { fontSize: 13, lineHeight: 18 },
  title: { fontSize: 22, lineHeight: 28 },
  card: { fontSize: 24, lineHeight: 32 },
} as const;
/** Minimum touch target in points (ENGINEERING §11). */
export const minTouchTarget = 44;

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
