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
import { platformStubs } from "./owner-platform-stubs.mjs";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const dist = resolve(process.argv[2] ?? join(root, "apps", "app", "dist"));
const axeSource = readFileSync(
  createRequire(import.meta.url).resolve("axe-core/axe.min.js"),
  "utf8",
);

// W2-A11Y (T-077): Home with its first-run steps, personal Settings, the four admin groups
// (Company activity holds Recordings, Devices and Activity) and the signed-out reset page.
const PAGES = [
  "/home",
  "/settings",
  "/reset-password",
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
  "/admin/instructions",
  "/admin/integrations",
  "/admin/attachments",
  "/admin/company",
  "/coaching",
  "/gallery",
];
// The owner console (a static page the server serves at /owner, UX-44b). Its API is stubbed here
// with realistic data so axe sees filled tables, the chart and the kill-switch statuses.
const OWNER_DIR = join(root, "apps", "agent-worker", "sotto_worker", "cloud", "owner");
const OWNER_VIEWS = [
  "overview",
  "companies",
  "features",
  "providers",
  "routing",
  "prompts",
  "health",
  "zoho",
  "signups",
  "audit",
  "account",
];
// A state that must be on screen when axe runs, so a crash or a missing panel cannot pass as
// "0 violations". /admin/settings holds the consent panel in its new-admin state (no record
// yet): the same panel the first-run "Who processes your calls" sheet shows (DD-4, T-081).
const MUST_SHOW = {
  "/admin/settings": ['[data-testid="consent-vendors"]', '[data-testid="consent-save"]'],
};
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 13, 9, 0, 0);
const OWNER_COMPANY = {
  id: "c1",
  name: "Zylker Trading",
  admin_email: "admin@zylker.example",
  status: "trial",
  plan: "trial",
  days_left: 12,
  seats: 3,
  seats_used: 2,
  minutes_month: 300,
  minutes_used: 120,
  calls_30d: 14,
  p95_avg_ms: 1180,
  last_active: NOW - 3_600_000,
};
const OWNER_API = {
  "/api/owner/me": { email: "owner@agn.example", must_change: false },
  "/api/owner/stats": {
    now: NOW,
    companies: 1,
    users: 3,
    devices: 4,
    active_today: 2,
    by_status: { trial: 1 },
    platforms: { mac: 2, windows: 1 },
    month: { calls: 14, minutes: 120, cards: 60, holding_lines: 2, escalations: 1 },
    p95_ms_30d: 1180,
    daily: [{ day: NOW - DAY, calls: 3, minutes: 22 }],
    trials_ending: [],
  },
  "/api/owner/companies": { companies: [OWNER_COMPANY] },
  "/api/owner/features": {
    features: [
      { id: "call_review", built: true, killed_at: null },
      { id: "zoho", built: true, killed_at: NOW - 86_400_000 },
      { id: "whatsapp", built: true, killed_at: null },
    ],
    companies: [
      {
        id: "c1",
        name: "Zylker Trading",
        entitled: { call_review: true, zoho: true, whatsapp: false },
      },
    ],
  },
  "/api/owner/audit": {
    items: [
      {
        at: NOW,
        company: "Zylker Trading",
        actor: "owner",
        action: "owner.features.kill",
        detail: "zoho",
        ip: "203.0.113.5",
      },
    ],
  },
  "/api/owner/zoho": { configured: false },
  "/api/owner/smtp": { configured: false },
  ...platformStubs(NOW, DAY),
};

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
    if (path === "/owner" || path.startsWith("/owner/")) {
      const name = path === "/owner" || path === "/owner/" ? "index.html" : path.slice(7);
      const file = join(OWNER_DIR, name);
      if (!file.startsWith(OWNER_DIR)) return res.writeHead(404).end();
      try {
        res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
        return res.end(readFileSync(file));
      } catch {
        return res.writeHead(404).end();
      }
    }
    // No server behind the export: the app falls back to its local sample values. Answering
    // /api/* with index.html (200, not JSON) crashed /admin/keys and /admin/settings to a blank
    // page that axe then passed (wave-4 hardening).
    if (path.startsWith("/api/")) {
      res.writeHead(404, { "content-type": "application/json" });
      return res.end('{"error":"not_found"}');
    }
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
    let pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));
    for (const path of PAGES) {
      pageErrors = [];
      await page.goto(base + path, { waitUntil: "networkidle" });
      await page.waitForTimeout(300); // fonts and the first render settle
      const missing = [];
      for (const sel of MUST_SHOW[path] ?? []) if (!(await page.$(sel))) missing.push(sel);
      const empty = (await page.evaluate(() => document.body.innerText.trim().length)) === 0;
      if (pageErrors.length || missing.length || empty) {
        checked += 1;
        failures += 1;
        console.log(`FAIL  ${path} (${mode.scheme}, ${mode.locale}): page did not render`);
        for (const e of pageErrors.slice(0, 3)) console.log(`      error: ${e}`);
        for (const sel of missing) console.log(`      missing: ${sel}`);
        if (empty) console.log("      empty page");
        continue;
      }
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
    // The owner console, same two colour schemes (English only: the console has no Arabic).
    if (mode.locale === "en") {
      await context.route("**/api/owner/**", (route) => {
        const url = new URL(route.request().url());
        const body = OWNER_API[url.pathname];
        return body
          ? route.fulfill({ json: body })
          : route.fulfill({ status: 404, json: { error: "not_found" } });
      });
      for (const view of OWNER_VIEWS) {
        await page.goto(`${base}/owner`, { waitUntil: "networkidle" });
        await page.click(`.tabs button[data-view="${view}"]`);
        await page.waitForTimeout(300);
        await page.addScriptTag({ content: axeSource });
        const result = await page.evaluate(async () =>
          globalThis.axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
          }),
        );
        checked += 1;
        const bad = result.violations.filter((v) => ["serious", "critical"].includes(v.impact));
        const label = `/owner ${view} (${mode.scheme}, ${mode.locale})`;
        if (bad.length === 0) {
          console.log(`ok    ${label}`);
          continue;
        }
        failures += bad.length;
        console.log(`FAIL  ${label}`);
        for (const v of bad) {
          console.log(`      ${v.impact}: ${v.id} — ${v.help} (${v.nodes.length} element(s))`);
          for (const n of v.nodes.slice(0, 3)) console.log(`        ${n.target.join(" ")}`);
        }
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
