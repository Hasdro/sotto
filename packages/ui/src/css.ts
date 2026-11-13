/**
 * CSS custom-property export of the design tokens, for the HTML surfaces that are not React
 * Native: the owner console, the Zoho connect pages, the landing page (DESIGN-SYSTEM §3.8).
 *
 * `packages/ui/tokens.css` is generated from this (`pnpm --filter @sotto/ui gen:css`); a test
 * fails if the file is stale. Pure string building, no runtime dependencies.
 */
import {
  CARD_KINDS,
  controlHeight,
  easing,
  glassBlur,
  layout,
  minTouchTarget,
  motion,
  radius,
  scrimOpacity,
  space,
  type Theme,
  themes,
  type,
  webFontFallback,
} from "./tokens.ts";

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** The colour variables of one theme, as `--ss-…: value;` lines. */
export function themeVars(t: Theme): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(t.color)) out.push(`--ss-${kebab(k)}: ${v};`);
  for (const kind of CARD_KINDS) {
    for (const [k, v] of Object.entries(t.card[kind])) {
      out.push(`--ss-card-${kind}-${kebab(k)}: ${v};`);
    }
  }
  for (const who of ["customer", "agent"] as const) {
    for (const [k, v] of Object.entries(t.speaker[who])) out.push(`--ss-${who}-${k}: ${v};`);
  }
  for (const [k, v] of Object.entries(t.glass)) out.push(`--ss-glass-${kebab(k)}: ${v};`);
  return out;
}

function staticVars(): string[] {
  const out: string[] = [
    `--ss-font: ${webFontFallback};`,
    "--ss-font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;",
    "--ss-weight-regular: 400;",
    "--ss-weight-medium: 500;",
    "--ss-weight-semibold: 600;",
  ];
  for (const [k, v] of Object.entries(type)) {
    out.push(`--ss-text-${kebab(k)}: ${v.fontSize}px;`);
    out.push(`--ss-leading-${kebab(k)}: ${v.lineHeight}px;`);
  }
  for (const [k, v] of Object.entries(space)) out.push(`--ss-space-${k}: ${v}px;`);
  for (const [k, v] of Object.entries(radius)) {
    out.push(`--ss-radius-${k}: ${k === "pill" ? 9999 : v}px;`);
  }
  out.push(`--ss-radius-tail: ${radius.sm}px;`);
  out.push(`--ss-control-height: ${controlHeight}px;`);
  out.push(`--ss-touch-target: ${minTouchTarget}px;`);
  out.push(`--ss-blur: blur(${glassBlur}px);`);
  out.push(`--ss-scrim-opacity: ${scrimOpacity};`);
  for (const k of ["fast", "base", "medium", "layout"] as const) {
    out.push(`--ss-dur-${k}: ${motion[k]}ms;`);
  }
  for (const [k, v] of Object.entries(easing)) out.push(`--ss-ease-${k}: ${v};`);
  out.push(`--ss-rail-width: ${layout.railWidth}px;`);
  out.push(`--ss-sidebar-width: ${layout.sidebarWidth}px;`);
  out.push(`--ss-content-width: ${layout.readableMaxWidth}px;`);
  out.push(`--ss-page-max-width: ${layout.contentMaxWidth}px;`);
  return out;
}

const block = (selector: string, lines: string[], indent = "") =>
  `${indent}${selector} {\n${lines.map((l) => `${indent}  ${l}`).join("\n")}\n${indent}}`;

/** The full generated stylesheet. */
export function tokensCss(): string {
  const dark = themeVars(themes.dark);
  return [
    "/* AGN Sales Shield design tokens (Quiet Paper Glass, D-041).",
    " * GENERATED from packages/ui/src/tokens.ts by `pnpm --filter @sotto/ui gen:css`. Do not edit.",
    " * Light is the default; dark follows the OS unless data-theme is set on <html>. */",
    block(":root", ["color-scheme: light;", ...staticVars(), ...themeVars(themes.light)]),
    `@media (prefers-color-scheme: dark) {\n${block(':root:not([data-theme="light"])', ["color-scheme: dark;", ...dark], "  ")}\n}`,
    block(':root[data-theme="dark"]', ["color-scheme: dark;", ...dark]),
    "",
  ].join("\n");
}
