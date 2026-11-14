#!/usr/bin/env node
// T-048: turns one logo direction into every raster the apps need.
// Usage: node docs/design/logo/export.mjs <a|b|c>   (after build.mjs; needs Playwright Chromium,
// and macOS `iconutil` for the .icns). Writes:
//   apps/desktop/build-assets/  icon.png (1024), icon.icns, icon.ico, trayTemplate.png (+@2x,
//                               macOS template image, black + alpha), tray.ico (Windows, colour)
//   apps/app/assets/brand/      symbol.svg, symbol-dark.svg, symbol-mono.svg, icon-512.png,
//                               favicon-32.png, favicon-48.png (landing and web)
//   apps/app/assets/            icon.png, favicon.png (what app.json points at), Android adaptive layers, splash
//   apps/landing/               favicon.svg, favicon-32.png, icon-512.png, logo.svg, logo-dark.svg
//   cloud/owner/favicon.svg     (owner console)
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const id = process.argv[2];
if (!["a", "b", "c"].includes(id ?? "")) {
  console.error("usage: export.mjs <a|b|c>");
  process.exit(2);
}
const desk = join(root, "apps", "desktop", "build-assets");
const brand = join(root, "apps", "app", "assets", "brand");
mkdirSync(desk, { recursive: true });
mkdirSync(brand, { recursive: true });
/** Brand ink (build.mjs INK): what the colour SVGs are drawn in. */
const INK = { light: "#005bbf", dark: "#6aa8f7" };
/** Favicons and the Windows tray (light or dark taskbar): a mid blue, 4.0:1 on white (#ffffff) and on a dark tab strip (#202124). */
const FAVICON_INK = "#2f7fe0";
const read = (name) => readFileSync(join(here, name), "utf8");
const svgs = {
  tile: read(`${id}-tile.svg`),
  light: read(`${id}.svg`),
  small: read(`${id}-small.svg`),
  mono: read(`${id}-mono.svg`),
  monoSmall: read(`${id}-mono-small.svg`),
};

const browser = await chromium.launch();
const page = await browser.newPage();
async function png(svg, px) {
  const sized = svg.replace("<svg ", `<svg width="${px}" height="${px}" `);
  await page.setViewportSize({ width: px, height: px });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${sized}</body></html>`,
  );
  return page.locator("body > svg").screenshot({ omitBackground: true });
}

// An .ico file whose entries are PNGs (supported since Windows Vista).
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(([px, data], i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(px >= 256 ? 0 : px, e);
    header.writeUInt8(px >= 256 ? 0 : px, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map(([, d]) => d)]);
}

try {
  const icon1024 = await png(svgs.tile, 1024);
  writeFileSync(join(desk, "icon.png"), icon1024);
  copyFileSync(join(desk, "icon.png"), join(root, "apps", "app", "assets", "icon.png"));

  const set = join(mkdtempSync(join(tmpdir(), "icon-")), "icon.iconset");
  mkdirSync(set);
  for (const px of [16, 32, 128, 256, 512]) {
    writeFileSync(join(set, `icon_${px}x${px}.png`), await png(svgs.tile, px));
    writeFileSync(join(set, `icon_${px}x${px}@2x.png`), await png(svgs.tile, px * 2));
  }
  execFileSync("iconutil", ["-c", "icns", set, "-o", join(desk, "icon.icns")]);
  rmSync(dirname(set), { recursive: true, force: true });

  const winSizes = [16, 24, 32, 48, 64, 128, 256];
  writeFileSync(
    join(desk, "icon.ico"),
    ico(await Promise.all(winSizes.map(async (px) => [px, await png(svgs.tile, px)]))),
  );
  // Tray: macOS template images are black with alpha (the menu bar tints them); 16 pt, @2x.
  // The heavy small variant: at 16 pt the regular strokes blur the handset cut-out.
  writeFileSync(join(desk, "trayTemplate.png"), await png(svgs.monoSmall, 16));
  writeFileSync(join(desk, "trayTemplate@2x.png"), await png(svgs.monoSmall, 32));
  writeFileSync(
    join(desk, "tray.ico"),
    ico([
      [16, await png(svgs.small.replaceAll(INK.light, FAVICON_INK), 16)],
      [32, await png(svgs.small.replaceAll(INK.light, FAVICON_INK), 32)],
    ]),
  );

  writeFileSync(join(brand, "symbol.svg"), svgs.light);
  writeFileSync(join(brand, "symbol-dark.svg"), read(`${id}-dark.svg`));
  writeFileSync(join(brand, "symbol-mono.svg"), svgs.mono);
  writeFileSync(join(brand, "icon-512.png"), await png(svgs.tile, 512));
  // Favicons sit on light and dark browser tabs: a mid blue that keeps >= 3:1 on both.
  const fav = svgs.small.replaceAll(INK.light, FAVICON_INK);
  writeFileSync(join(brand, "favicon-32.png"), await png(fav, 32));
  writeFileSync(join(brand, "favicon-16.png"), await png(fav, 16));
  // The SVG favicon switches ink with the tab's colour scheme.
  writeFileSync(
    join(brand, "favicon.svg"),
    svgs.small.replace(
      "<title>",
      `<style>path{fill:${INK.light}}@media (prefers-color-scheme: dark){path{fill:${INK.dark}}}</style><title>`,
    ),
  );
  const fav48 = await png(fav, 48);
  writeFileSync(join(brand, "favicon-48.png"), fav48);
  writeFileSync(join(root, "apps", "app", "assets", "favicon.png"), fav48);
  // T-088: the landing page and the owner console keep their own copies (same file names, so no
  // HTML change when the logo changes).
  const landing = join(root, "apps", "landing");
  copyFileSync(join(brand, "favicon.svg"), join(landing, "favicon.svg"));
  copyFileSync(join(brand, "favicon-32.png"), join(landing, "favicon-32.png"));
  copyFileSync(join(brand, "icon-512.png"), join(landing, "icon-512.png"));
  copyFileSync(join(brand, "symbol.svg"), join(landing, "logo.svg"));
  copyFileSync(join(brand, "symbol-dark.svg"), join(landing, "logo-dark.svg"));
  const owner = join(root, "apps", "agent-worker", "sotto_worker", "cloud", "owner");
  copyFileSync(join(brand, "favicon.svg"), join(owner, "favicon.svg"));

  // Expo (mobile, on hold under D-027): Android adaptive icon and the splash image. The adaptive
  // foreground keeps the symbol inside the 66 % safe zone; the monochrome layer is alpha only.
  const inset = (svg, pct) => {
    const pad = (100 - pct) / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${svg.replace(
      "<svg ",
      `<svg x="${pad}" y="${pad}" width="${pct}" height="${pct}" `,
    )}</svg>`;
  };
  const assets = join(root, "apps", "app", "assets");
  const paper = svgs.light.replaceAll(INK.light, "#f4f6f8");
  writeFileSync(join(assets, "android-icon-foreground.png"), await png(inset(paper, 50), 512));
  writeFileSync(
    join(assets, "android-icon-background.png"),
    await png(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1" fill="${INK.light}"/></svg>`,
      512,
    ),
  );
  writeFileSync(join(assets, "android-icon-monochrome.png"), await png(inset(svgs.mono, 50), 432));
  writeFileSync(join(assets, "splash-icon.png"), await png(inset(svgs.light, 60), 1024));

  writeFileSync(join(brand, "DIRECTION"), `${id}\n`);
} finally {
  await browser.close();
}
console.log(`exported direction ${id} to ${desk} and ${brand}`);
