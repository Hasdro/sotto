#!/usr/bin/env node
// T-088: one PNG showing every exported logo file, on light and dark, for review.
// Usage: node docs/design/logo/contact-sheet.mjs   (after export.mjs; needs Playwright Chromium,
// macOS `iconutil` and ImageMagick `magick` to unpack .icns/.ico). Writes
// docs/design/screens/logos/contact-sheet.png.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const out = join(root, "docs", "design", "screens", "logos");
mkdirSync(out, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), "logos-"));

const files = [
  "apps/desktop/build-assets/icon.png",
  "apps/desktop/build-assets/trayTemplate.png",
  "apps/desktop/build-assets/trayTemplate@2x.png",
  "apps/app/assets/icon.png",
  "apps/app/assets/favicon.png",
  "apps/app/assets/splash-icon.png",
  "apps/app/assets/android-icon-foreground.png",
  "apps/app/assets/android-icon-background.png",
  "apps/app/assets/android-icon-monochrome.png",
  "apps/app/assets/brand/symbol.svg",
  "apps/app/assets/brand/symbol-dark.svg",
  "apps/app/assets/brand/symbol-mono.svg",
  "apps/app/assets/brand/favicon.svg",
  "apps/app/assets/brand/favicon-16.png",
  "apps/app/assets/brand/favicon-32.png",
  "apps/app/assets/brand/favicon-48.png",
  "apps/app/assets/brand/icon-512.png",
  "apps/landing/logo.svg",
  "apps/landing/logo-dark.svg",
  "apps/landing/favicon.svg",
  "apps/landing/favicon-32.png",
  "apps/landing/icon-512.png",
  "apps/agent-worker/sotto_worker/cloud/owner/favicon.svg",
].map((f) => [f, join(root, f)]);

// Unpack the container formats so each size shows.
const set = join(tmp, "icon.iconset");
execFileSync("iconutil", ["-c", "iconset", join(root, "apps/desktop/build-assets/icon.icns"), "-o", set]);
for (const n of readdirSync(set).sort()) files.push([`icon.icns › ${n}`, join(set, n)]);
for (const ico of ["icon.ico", "tray.ico"]) {
  const dir = join(tmp, ico);
  mkdirSync(dir);
  execFileSync("magick", [join(root, "apps/desktop/build-assets", ico), join(dir, "f-%02d.png")]);
  for (const n of readdirSync(dir).sort()) files.push([`${ico} › frame ${n.slice(2, 4)}`, join(dir, n)]);
}

const uri = (p) =>
  `data:${p.endsWith(".svg") ? "image/svg+xml" : "image/png"};base64,${readFileSync(p).toString("base64")}`;
const cell = ([label, p]) =>
  `<figure><div class="pair"><span class="l"><img src="${uri(p)}"></span><span class="d"><img src="${uri(p)}"></span></div><figcaption>${label}</figcaption></figure>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;padding:24px;background:#fff;font:12px/1.4 -apple-system,system-ui,sans-serif;color:#1d1d1f}
h1{font-size:18px;margin:0 0 16px}main{display:grid;grid-template-columns:repeat(6,1fr);gap:16px}
figure{margin:0}.pair{display:flex;gap:4px}.pair span{flex:1;height:104px;display:grid;place-items:center;border-radius:10px}
.l{background:#f2f4f6}.d{background:#202124}img{max-width:88px;max-height:88px;image-rendering:auto}
figcaption{margin-top:4px;word-break:break-all;color:#555}</style></head><body>
<h1>AGN Sales Shield — every logo file (T-088, blue #005bbf / dark #6aa8f7, favicon #2f7fe0). Each on light and dark.</h1>
<main>${files.map(([l, p]) => cell([l.startsWith("apps/") ? relative(root, join(root, l)) : l, p])).join("")}</main></body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 800 } });
  await page.setContent(html);
  await page.screenshot({ path: join(out, "contact-sheet.png"), fullPage: true });
} finally {
  await browser.close();
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`wrote ${join(out, "contact-sheet.png")} (${files.length} images)`);
