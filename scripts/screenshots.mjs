#!/usr/bin/env node
// Phone-width screenshots of the exported web app (evidence for DESIGN.md checks).
// Usage: node scripts/screenshots.mjs <out-dir> [width=390] [paths…]
// Needs `pnpm --filter @sotto/app export:web` and a Playwright Chromium. Each page is shot in
// light and dark (English) and light Arabic (RTL); `#menu` after a path also opens the drawer.
// For a build that names a server (D-022), SOTTO_SHOT_TOKEN signs the pages in with a test
// account's app token; SOTTO_SHOT_TAG is added to file names. SOTTO_SHOT_BASE (e.g. a local
// `python -m sotto_worker.cloud serve --static <export>`) shoots that origin instead of serving
// the export here, so signed-in pages show real server data. SOTTO_SHOT_ROLE sets the demo role.
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const dist = resolve(join(root, "apps", "app", "dist"));
const [outArg, widthArg, ...pathArgs] = process.argv.slice(2);
const out = resolve(outArg ?? join(root, "docs", "evidence", "shots"));
const width = Number(widthArg ?? 390);
const PAGES = pathArgs.length
  ? pathArgs
  : ["/call?mock=1", "/call?mock=1#menu", "/playbook", "/inbox", "/account", "/history"];
const MODES = [
  { scheme: "light", locale: "en" },
  { scheme: "dark", locale: "en" },
  { scheme: "light", locale: "ar" },
  // SOTTO_SHOT_ALL=1 adds dark Arabic, so every screen has light/dark × LTR/RTL (T-085).
  ...(process.env.SOTTO_SHOT_ALL ? [{ scheme: "dark", locale: "ar" }] : []),
];
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".ttf": "font/ttf",
  ".png": "image/png",
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
      if (extname(path)) return res.writeHead(404).end();
      file = join(dist, "index.html");
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

mkdirSync(out, { recursive: true });
const server = process.env.SOTTO_SHOT_BASE ? null : await serve();
const base = process.env.SOTTO_SHOT_BASE ?? `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
try {
  for (const mode of MODES) {
    const context = await browser.newContext({
      colorScheme: mode.scheme,
      viewport: { width, height: 844 },
      deviceScaleFactor: Number(process.env.SOTTO_SHOT_SCALE ?? 2),
    });
    await context.addInitScript(
      ([locale, token, role]) => {
        localStorage.setItem("sotto.locale", locale);
        localStorage.setItem("sotto.viewRole", role);
        if (token) {
          localStorage.setItem("sotto.token", token);
          // The refresh-token session (D-029) that a sign-in on the web would keep.
          localStorage.setItem(
            "sotto.session",
            JSON.stringify({ access: token, refresh: null, access_expires_at: null }),
          );
        }
      },
      [mode.locale, process.env.SOTTO_SHOT_TOKEN ?? "", process.env.SOTTO_SHOT_ROLE ?? "admin"],
    );
    const page = await context.newPage();
    for (const entry of PAGES) {
      const [path, hash] = entry.split("#");
      await page.goto(base + path, { waitUntil: "networkidle" });
      await page.waitForTimeout(hash ? 400 : 1200);
      if (hash === "menu") {
        await page.getByTestId("menu-button").click();
        await page.waitForTimeout(400);
      }
      const name = `${path.split("?")[0].replace(/\W+/g, "-").replace(/^-|-$/g, "") || "home"}${
        hash ? `-${hash}` : ""
      }${process.env.SOTTO_SHOT_TAG ? `-${process.env.SOTTO_SHOT_TAG}` : ""}-${mode.scheme}-${mode.locale}-${width}.png`;
      await page.screenshot({ path: join(out, name) });
      console.log(name);
    }
    await context.close();
  }
} finally {
  await browser.close();
  server?.close();
}
