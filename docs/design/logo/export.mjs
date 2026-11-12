#!/usr/bin/env node
// T-048: turns one logo direction into every raster the apps need.
// Usage: node docs/design/logo/export.mjs <a|b|c>   (after build.mjs; needs Playwright Chromium,
// and macOS `iconutil` for the .icns). Writes:
//   apps/desktop/build-assets/  icon.png (1024), icon.icns, icon.ico, trayTemplate.png (+@2x,
//                               macOS template image, black + alpha), tray.ico (Windows, colour)
//   apps/app/assets/brand/      symbol.svg, symbol-dark.svg, symbol-mono.svg, icon-512.png,
//                               favicon-32.png, favicon-48.png (landing and web)
//   apps/app/assets/            icon.png and favicon.png (what app.json points at)
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
const read = (name) => readFileSync(join(here, name), "utf8");
const svgs = {
  tile: read(`${id}-tile.svg`),
  light: read(`${id}.svg`),
  small: read(`${id}-small.svg`),
  mono: read(`${id}-mono.svg`),
};

const browser = await chromium.launch();
const page = await browser.newPage();
async function png(svg, px) {
  const sized = svg.replace("<svg ", `<svg width="${px}" height="${px}" `);
  await page.setViewportSize({ width: px, height: px });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${sized}</body></html>`,
  );
  return page.locator("svg").screenshot({ omitBackground: true });
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
  writeFileSync(join(desk, "trayTemplate.png"), await png(svgs.mono, 16));
  writeFileSync(join(desk, "trayTemplate@2x.png"), await png(svgs.mono, 32));
  writeFileSync(
    join(desk, "tray.ico"),
    ico([
      [16, await png(svgs.small, 16)],
      [32, await png(svgs.small, 32)],
    ]),
  );

  writeFileSync(join(brand, "symbol.svg"), svgs.light);
  writeFileSync(join(brand, "symbol-dark.svg"), read(`${id}-dark.svg`));
  writeFileSync(join(brand, "symbol-mono.svg"), svgs.mono);
  writeFileSync(join(brand, "icon-512.png"), await png(svgs.tile, 512));
  writeFileSync(join(brand, "favicon-32.png"), await png(svgs.small, 32));
  const fav48 = await png(svgs.small, 48);
  writeFileSync(join(brand, "favicon-48.png"), fav48);
  writeFileSync(join(root, "apps", "app", "assets", "favicon.png"), fav48);
  writeFileSync(join(brand, "DIRECTION"), `${id}\n`);
} finally {
  await browser.close();
}
console.log(`exported direction ${id} to ${desk} and ${brand}`);
