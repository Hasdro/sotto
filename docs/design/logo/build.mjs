#!/usr/bin/env node
// T-048: builds the three logo directions as SVG files and the comparison page (index.html).
// Usage: node docs/design/logo/build.mjs   (no dependencies; writes next to this file)
// Every direction is a standalone symbol with no letters, on a 64-unit grid. Each one has:
//   <id>.svg        colour, for light backgrounds
//   <id>-dark.svg   colour, for dark backgrounds
//   <id>-mono.svg   one colour (black), the tray / template version
//   <id>-small.svg  heavier strokes for 16 px (<id>-mono-small.svg: the tray template)
//   <id>-tile.svg   the app icon (1024 grid, macOS-style rounded square)
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// The palette of the D-041 redesign (packages/ui tokens): the one blue accent, `color.primary`
// light and dark (T-088 replaced the T-050 ink-teal). One warm signal accent for directions a/b.
const INK = { light: "#005bbf", dark: "#6aa8f7" };
const SIGNAL = { light: "#c27a0e", dark: "#f0b54a" };
const PAPER = "#f4f6f8";

// A phone handset on the 64 grid: earpiece top-left, mouthpiece bottom-right, grip bowing out.
const handset = (fill, w = 1) => `
  <g fill="${fill}">
    <rect x="${8 - w}" y="${10 - w}" width="${18 + 2 * w}" height="${11 + 2 * w}" rx="${5 + w}" transform="rotate(-38 17 15.5)"/>
    <rect x="${38 - w}" y="${43 - w}" width="${18 + 2 * w}" height="${11 + 2 * w}" rx="${5 + w}" transform="rotate(-52 47 48.5)"/>
  </g>
  <path d="M15 17 C9 33 23 51 46 50" fill="none" stroke="${fill}" stroke-width="${8 + w}" stroke-linecap="round"/>`;

const DIRECTIONS = [
  {
    id: "a",
    name: "Handset shield",
    idea: "A handset bent into the outline of a shield: the earpiece and mouthpiece are its shoulders, the grip is the point. Open at the top, so it still reads as a phone.",
    draw: ({ ink, small }) => {
      const sw = small ? 11 : 8.5;
      const pad = small ? 2 : 0;
      // Earpiece and mouthpiece tilt in toward each other, like a handset's cups.
      return `
  <g fill="${ink}">
    <rect x="${4 - pad}" y="${7 - pad}" width="${22 + 2 * pad}" height="${12 + 2 * pad}" rx="${6.5 + pad}" transform="rotate(-6 15 13.5)"/>
    <rect x="${38 - pad}" y="${7 - pad}" width="${22 + 2 * pad}" height="${12 + 2 * pad}" rx="${6.5 + pad}" transform="rotate(6 49 13.5)"/>
  </g>
  <path d="M15 17 V30 C15 40 22 48.5 32 55.5 C42 48.5 49 40 49 30 V17" fill="none" stroke="${ink}" stroke-width="${sw}" stroke-linejoin="miter" stroke-miterlimit="8" stroke-linecap="round"/>`;
    },
  },
  {
    id: "b",
    name: "Handset and check",
    idea: "A plain handset with one warm check beside the earpiece: the call is covered. The most literal of the three; the check carries the signal colour.",
    draw: ({ ink, signal, small }) => `
  ${handset(ink, small ? 1.5 : 0)}
  <path d="M33 21 L40 28 L55 11" fill="none" stroke="${signal}" stroke-width="${small ? 8 : 6.5}" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  {
    id: "c",
    name: "Shield monogram",
    idea: "A solid shield with the handset cut out of it. Heaviest at small sizes and the easiest to spot in a tray, but the most conventional.",
    draw: ({ ink, cut, small, uid }) => `
  <defs><mask id="m${uid}"><rect width="64" height="64" fill="#fff"/>
    <g transform="translate(14.5 14.5) scale(0.55)">${handset("#000", small ? 2.5 : 0.5)}</g>
  </mask></defs>
  <path d="M32 3 L57 11 V29 C57 45 46.5 55 32 61 C17.5 55 7 45 7 29 V11 Z" fill="${ink}" mask="url(#m${uid})"/>
  ${cut ? `<g transform="translate(14.5 14.5) scale(0.55)">${handset(cut, small ? 2.5 : 0.5)}</g>` : ""}`,
  },
];

let uid = 0;
const svg = (body, view = 64) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view} ${view}" role="img" aria-label="AGN Sales Shield"><title>AGN Sales Shield</title>${body}\n</svg>\n`;

function variants(d) {
  const mk = (o) => d.draw({ uid: ++uid, ...o });
  return {
    light: svg(mk({ ink: INK.light, signal: SIGNAL.light })),
    dark: svg(mk({ ink: INK.dark, signal: SIGNAL.dark })),
    mono: svg(mk({ ink: "#000", signal: "#000" })),
    small: svg(mk({ ink: INK.light, signal: SIGNAL.light, small: true })),
    smallDark: svg(mk({ ink: INK.dark, signal: SIGNAL.dark, small: true })),
    monoSmall: svg(mk({ ink: "#000", signal: "#000", small: true })),
    // App icon: the symbol in paper on a brand-blue rounded square (824 of 1024, macOS grid).
    tile: svg(
      `<rect x="100" y="100" width="824" height="824" rx="185" fill="${INK.light}"/>
  <g transform="translate(232 232) scale(8.75)">${mk({ ink: PAPER, signal: SIGNAL.dark })}</g>`,
      1024,
    ),
  };
}

const built = DIRECTIONS.map((d) => ({ ...d, v: variants(d) }));
for (const d of built) {
  writeFileSync(join(here, `${d.id}.svg`), d.v.light);
  writeFileSync(join(here, `${d.id}-dark.svg`), d.v.dark);
  writeFileSync(join(here, `${d.id}-mono.svg`), d.v.mono);
  writeFileSync(join(here, `${d.id}-small.svg`), d.v.small);
  writeFileSync(join(here, `${d.id}-mono-small.svg`), d.v.monoSmall);
  writeFileSync(join(here, `${d.id}-tile.svg`), d.v.tile);
}

const inline = (s, px, extra = "") =>
  s.replace("<svg ", `<svg width="${px}" height="${px}" aria-hidden="true" ${extra}`);

const section = (d) => `
<section class="dir" id="dir-${d.id}" aria-labelledby="h-${d.id}">
  <header>
    <h2 id="h-${d.id}"><span class="key">${d.id}</span>${d.name}</h2>
    <p>${d.idea}</p>
  </header>
  <div class="row">
    <figure class="pane light">
      <div class="sizes">${inline(d.v.light, 512, 'class="big"')}</div>
      <div class="sizes">${inline(d.v.light, 32)}${inline(d.v.small, 16)}</div>
      <figcaption>On light: 512, 32 and 16 px</figcaption>
    </figure>
    <figure class="pane dark">
      <div class="sizes">${inline(d.v.dark, 512, 'class="big"')}</div>
      <div class="sizes">${inline(d.v.dark, 32)}${inline(d.v.smallDark, 16)}</div>
      <figcaption>On dark: 512, 32 and 16 px</figcaption>
    </figure>
    <figure class="pane chrome">
      <div class="tile">${inline(d.v.tile, 160)}</div>
      <div class="menubar light-bar">${inline(d.v.monoSmall, 16)}<span>● Live</span></div>
      <div class="menubar dark-bar">${inline(d.v.monoSmall, 16, 'class="invert"')}<span>● Live</span></div>
      <figcaption>App icon, and the menu-bar icon in a light and a dark bar</figcaption>
    </figure>
  </div>
</section>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sales Shield logo directions</title>
<style>
  :root { --bg:#f2f4f6; --surface:#fff; --ink:#15212c; --muted:#4d5b69; --line:#d5dce3; --brand:${INK.light}; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0e151c; --surface:#151f28; --ink:#e7edf2; --muted:#9ba9b6; --line:#26333f; --brand:${INK.dark}; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; }
  main { max-width:1180px; margin:0 auto; padding:40px 16px 64px; }
  h1 { font-size:28px; line-height:36px; font-weight:600; margin:0 0 8px; }
  .lede { color:var(--muted); max-width:62ch; margin:0 0 40px; }
  .dir { border-top:1px solid var(--line); padding:32px 0; }
  .dir header { display:grid; grid-template-columns: minmax(0,1fr); gap:4px; margin-bottom:20px; max-width:70ch; }
  h2 { font-size:20px; font-weight:600; margin:0; display:flex; align-items:center; gap:12px; }
  .key { display:inline-grid; place-items:center; width:32px; height:32px; border-radius:10px; background:var(--brand); color:var(--bg); font-size:16px; }
  .dir p { margin:0; color:var(--muted); }
  .row { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; }
  .pane { margin:0; border-radius:16px; padding:20px; display:flex; flex-direction:column; gap:16px; border:1px solid var(--line); }
  .pane.light { background:#ffffff; color:#4d5b69; }
  .pane.dark { background:#0e151c; color:#9ba9b6; border-color:#26333f; }
  .pane.chrome { background:var(--surface); color:var(--muted); }
  .sizes { display:flex; align-items:center; gap:20px; }
  svg.big { width:100%; height:auto; max-width:220px; }
  .tile svg { width:160px; height:160px; }
  .menubar { display:flex; align-items:center; gap:8px; padding:4px 12px; border-radius:6px; font-size:13px; }
  .light-bar { background:#e9ebee; color:#000; }
  .dark-bar { background:#2a2c30; color:#fff; }
  svg.invert { filter: invert(1); }
  figcaption { font-size:13px; margin-top:auto; }
  .pick { margin-top:32px; padding:20px; border-radius:16px; background:var(--surface); border:1px solid var(--line); max-width:70ch; }
  @media (max-width: 860px) { .row { grid-template-columns:minmax(0,1fr); } }
</style>
</head>
<body>
<main>
  <h1>AGN Sales Shield: three logo directions</h1>
  <p class="lede">Standalone symbols, no letters. Each is shown at 512, 32 and 16 px on light and dark, as the app icon, and as the one-colour menu-bar icon macOS tints itself. The owner picked direction c (12 Nov 2026); it is wired into the apps, installers, tray and landing page.</p>
  ${built.map(section).join("\n")}
  <div class="pick"><strong>Chosen:</strong> c, Shield monogram (owner, 12 Nov 2026). Rasters come from <code>export.mjs c</code>.</div>
</main>
</body>
</html>
`;
writeFileSync(join(here, "index.html"), html);
console.log(`wrote ${built.length} directions and index.html to ${here}`);
