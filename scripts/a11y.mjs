#!/usr/bin/env node
// `pnpm a11y` (P3.3, CONSTRAINTS.md): axe-core on every screen of the exported web app, in light
// and dark, English and Arabic (RTL). Fails on any serious or critical violation (WCAG 2 A/AA).
// Needs `pnpm --filter @sotto/app export:web` first and a Playwright Chromium
// (`npx playwright install chromium`). No server needed: screens use their sample data.
import { readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const dist = resolve(process.argv[2] ?? join(root, "apps", "app", "dist"));
const axeSource = readFileSync(
  createRequire(import.meta.url).resolve("axe-core/axe.min.js"),
  "utf8",
);

const PAGES = [
  "/call",
  "/history",
  "/history/c-1042",
  "/playbook",
  "/inbox",
  "/admin",
  "/admin/prompts",
  "/admin/models",
  "/admin/keys",
  "/admin/settings",
  "/admin/features",
  "/gallery",
];
const MODES = [
  { scheme: "light", locale: "en" },
  { scheme: "dark", locale: "en" },
  { scheme: "light", locale: "ar" },
];
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

function serve() {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]));
    let file = join(dist, path);
    if (!file.startsWith(dist)) return res.writeHead(404).end();
    try {
      if (statSync(file).isDirectory()) file = join(file, "index.html");
      statSync(file);
    } catch {
      if (extname(path)) return res.writeHead(404).end(); // a missing asset is a real 404
      file = join(dist, "index.html"); // client-side route
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
let failures = 0;
let checked = 0;
try {
  for (const mode of MODES) {
    const context = await browser.newContext({
      colorScheme: mode.scheme,
      viewport: { width: 1280, height: 900 },
    });
    // The app keeps the chosen language here (apps/app/lib/locale.tsx); "admin" sees every page.
    await context.addInitScript(
      ([locale]) => {
        localStorage.setItem("sotto.locale", locale);
        localStorage.setItem("sotto.viewRole", "admin");
      },
      [mode.locale],
    );
    const page = await context.newPage();
    for (const path of PAGES) {
      await page.goto(base + path, { waitUntil: "networkidle" });
      await page.waitForTimeout(300); // fonts and the first render settle
      await page.addScriptTag({ content: axeSource });
      const result = await page.evaluate(async () =>
        globalThis.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
        }),
      );
      checked += 1;
      const bad = result.violations.filter((v) => ["serious", "critical"].includes(v.impact));
      const label = `${path} (${mode.scheme}, ${mode.locale})`;
      if (bad.length === 0) {
        console.log(`ok    ${label}`);
        continue;
      }
      failures += bad.length;
      console.log(`FAIL  ${label}`);
      for (const v of bad) {
        console.log(`      ${v.impact}: ${v.id} — ${v.help} (${v.nodes.length} element(s))`);
        for (const n of v.nodes.slice(0, 3)) console.log(`        ${n.target.join(" ")}`);
        const [first] = v.nodes;
        if (first) console.log(`        ${first.html}\n        ${first.failureSummary}`);
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${checked} page checks, ${failures} serious/critical violation(s)`);
process.exit(failures === 0 ? 0 : 1);
