#!/usr/bin/env node
// T-086 evidence: screenshots + axe (serious/critical) of the redesigned HTML panels — the owner
// console, the Zoho connect pages and the landing page — in light/dark, LTR/RTL, 390/1280 px.
//   node scripts/panels-shots.mjs <ownerBase e.g. http://127.0.0.1:8788> <zohoPagesDir> [outDir]
// The owner console is the real local server (`python -m sotto_worker.cloud serve`); its API is
// stubbed in the browser with sample data so every table is filled. Zoho pages come from
// scripts/zoho-pages-sample.py. RTL on the owner console and Zoho pages (English only) is a
// mirroring check: dir="rtl" is set on <html>.
import { mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const [ownerBase, zohoDir, outArg] = process.argv.slice(2);
if (!ownerBase || !zohoDir) {
  console.error("usage: node scripts/panels-shots.mjs <ownerBase> <zohoPagesDir> [outDir]");
  process.exit(2);
}
const out = resolve(outArg ?? join(root, "docs/design/screens/panels"));
mkdirSync(out, { recursive: true });
const axe = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function staticServer(dir) {
  const srv = createServer((q, r) => {
    try {
      const p = q.url === "/" ? "/index.html" : q.url.split("?")[0].split("#")[0];
      r.setHeader("content-type", TYPES[extname(p)] ?? "text/plain");
      r.end(readFileSync(join(dir, p)));
    } catch {
      r.statusCode = 404;
      r.end();
    }
  }).listen(0, "127.0.0.1");
  return new Promise((ok) => srv.on("listening", () => ok(srv)));
}

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 14, 9, 0, 0);
const co = (id, name, status, extra = {}) => ({
  id,
  name,
  admin_email: `admin@${name.split(" ")[0].toLowerCase()}.example`,
  admin_name: "Sam Admin",
  status,
  plan: status === "trial" ? "trial" : "team",
  days_left: status === "trial" ? 9 : null,
  trial_ends_at: NOW + 9 * DAY,
  seats: 20,
  seats_used: 7,
  minutes_month: 10000,
  minutes_used: 4200,
  calls_30d: 182,
  p95_avg_ms: 978,
  last_active: NOW - 3_600_000,
  created_at: NOW - 40 * DAY,
  ...extra,
});
const COMPANIES = [
  co("c1", "Zylker Trading", "trial", {
    seats: 3,
    seats_used: 2,
    minutes_month: 300,
    minutes_used: 120,
    calls_30d: 14,
    p95_avg_ms: 1180,
  }),
  co("c2", "Northwind Foods", "active"),
  co("c3", "Contoso Realty", "active", { minutes_used: 9400, calls_30d: 410 }),
  co("c4", "Fabrikam Clinics", "expired", { calls_30d: 0, last_active: NOW - 20 * DAY }),
  co("c5", "Tailspin Travel", "suspended", { calls_30d: 0, last_active: NOW - 45 * DAY }),
];
const FEATURES = [
  "call_review",
  "follow_up",
  "recordings",
  "reports",
  "ai_knowledge",
  "zoho",
  "whatsapp",
  "learned_instructions",
];
const API = {
  "/api/owner/me": { email: "owner@agn.example", must_change: false },
  "/api/owner/stats": {
    now: NOW,
    companies: 5,
    users: 41,
    devices: 57,
    active_today: 18,
    by_status: { trial: 1, active: 2, expired: 1, suspended: 1 },
    platforms: { mac: 31, windows: 22, web: 4 },
    month: { calls: 606, minutes: 13720, cards: 5120, holding_lines: 61, escalations: 14 },
    p95_ms_30d: 978,
    daily: Array.from({ length: 30 }, (_, i) => ({
      day: NOW - (29 - i) * DAY,
      calls: 8 + ((i * 7) % 23),
      minutes: 90 + ((i * 37) % 160),
    })),
    trials_ending: [{ ...COMPANIES[0], days_left: 2 }],
  },
  "/api/owner/companies": { companies: COMPANIES },
  "/api/owner/features": {
    features: FEATURES.map((id) => ({
      id,
      built: true,
      killed_at: id === "whatsapp" ? NOW - DAY : null,
    })),
    companies: COMPANIES.map((c, i) => ({
      id: c.id,
      name: c.name,
      entitled: Object.fromEntries(FEATURES.map((f, j) => [f, (i + j) % 4 !== 0])),
    })),
  },
  "/api/owner/audit": {
    items: [
      {
        at: NOW - 60_000,
        company: "Zylker Trading",
        actor: "owner@agn.example",
        action: "owner.trial.extend",
        detail: "+7 days",
        ip: "203.0.113.5",
      },
      {
        at: NOW - 3_600_000,
        company: "—",
        actor: "owner@agn.example",
        action: "owner.features.kill",
        detail: "whatsapp",
        ip: "203.0.113.5",
      },
      {
        at: NOW - 2 * DAY,
        company: "Northwind Foods",
        actor: "admin@northwind.example",
        action: "admin.role.change",
        detail: "lee@northwind.example → manager",
        ip: "198.51.100.7",
      },
    ],
  },
  "/api/owner/zoho": { configured: true, client_id_hint: "1000.AB…", dc: "us" },
  "/api/owner/smtp": { configured: false },
};

const MODES = [];
for (const scheme of ["light", "dark"])
  for (const dir of ["ltr", "rtl"])
    for (const width of [1280, 390])
      MODES.push({ scheme, dir, width, height: width > 500 ? 900 : 844 });
const tag = (m) => `${m.width}-${m.scheme}-${m.dir}`;

const browser = await chromium.launch();
let bad = 0;
async function check(page, label) {
  await page.evaluate(axe);
  const res = await page.evaluate(() =>
    globalThis.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }),
  );
  const sev = res.violations.filter((v) => ["serious", "critical"].includes(v.impact));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  console.log(
    `${sev.length || overflow ? "FAIL" : "ok  "} ${label}${overflow ? " (horizontal overflow)" : ""}`,
  );
  for (const v of sev)
    console.log(
      `     ${v.impact}: ${v.id} — ${v.nodes
        .map((n) => n.target.join(" "))
        .slice(0, 3)
        .join(" | ")}`,
    );
  bad += sev.length + (overflow ? 1 : 0);
}
async function context(m, locale = "en") {
  const ctx = await browser.newContext({
    colorScheme: m.scheme,
    viewport: { width: m.width, height: m.height },
    locale,
    reducedMotion: "reduce",
  });
  return ctx;
}
const setDir = (page, dir) =>
  page.evaluate((d) => document.documentElement.setAttribute("dir", d), dir);

// ---------- Owner console ----------
for (const m of MODES) {
  const ctx = await context(m);
  await ctx.route("**/api/owner/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const body =
      API[path] ??
      (path.startsWith("/api/owner/companies/")
        ? {
            ...COMPANIES[0],
            ends_at: NOW + 9 * DAY,
            notes: "Demo for the Zoho Partner meeting.",
            suspended: false,
            users: [
              {
                name: "Sam Admin",
                email: "admin@zylker.example",
                role: "admin",
                active: true,
                last_seen_at: NOW - 600_000,
              },
              {
                name: "Ana Agent",
                email: "ana@zylker.example",
                role: "agent",
                active: true,
                last_seen_at: NOW - 7_200_000,
              },
            ],
            devices: [
              {
                label: "Ana's MacBook",
                user: "ana@zylker.example",
                platform: "mac",
                app_version: "0.4.3",
                last_seen: NOW - 7_200_000,
                revoked: false,
              },
            ],
            calls: [],
            audit: [
              {
                at: NOW - 60_000,
                actor: "owner@agn.example",
                action: "owner.trial.extend",
                detail: "+7 days",
              },
            ],
          }
        : { ok: true });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  const page = await ctx.newPage();
  // Sign-in first (an unauthenticated /me)
  await page.route("**/api/owner/me", (r) =>
    r.fulfill({ status: 401, contentType: "application/json", body: '{"error":"unauthorized"}' }),
  );
  await page.goto(`${ownerBase}/owner`, { waitUntil: "networkidle" });
  await setDir(page, m.dir);
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(out, `owner-login-${tag(m)}.png`) });
  await check(page, `owner login ${tag(m)}`);
  await page.unroute("**/api/owner/me");
  await page.goto(`${ownerBase}/owner`, { waitUntil: "networkidle" });
  await setDir(page, m.dir);
  for (const view of ["overview", "companies", "features", "audit", "account"]) {
    await page.evaluate(
      (v) => document.querySelector(`.tabs button[data-view="${v}"]`).click(),
      view,
    );
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(out, `owner-${view}-${tag(m)}.png`), fullPage: true });
    await check(page, `owner ${view} ${tag(m)}`);
  }
  if (m.width === 1280 && m.dir === "ltr") {
    await page.evaluate(() =>
      document.querySelector('.tabs button[data-view="companies"]').click(),
    );
    await page.waitForTimeout(300);
    await page.click("#companies tbody tr");
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(out, `owner-drawer-${tag(m)}.png`) });
    await check(page, `owner drawer ${tag(m)}`);
    await page.keyboard.press("Escape");
    await page.click("#newCompany");
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(out, `owner-new-${tag(m)}.png`) });
    await check(page, `owner new-company dialog ${tag(m)}`);
  }
  await ctx.close();
}

// ---------- Zoho connect pages ----------
const zsrv = await staticServer(resolve(zohoDir));
const zbase = `http://127.0.0.1:${zsrv.address().port}`;
for (const m of MODES) {
  const ctx = await context(m);
  const page = await ctx.newPage();
  for (const name of ["connect", "connected", "expired", "cancelled"]) {
    await page.goto(`${zbase}/${name}.html`);
    await setDir(page, m.dir);
    await page.waitForTimeout(100);
    await page.screenshot({ path: join(out, `zoho-${name}-${tag(m)}.png`), fullPage: true });
    await check(page, `zoho ${name} ${tag(m)}`);
  }
  await ctx.close();
}
zsrv.close();

// ---------- Landing ----------
const lsrv = await staticServer(join(root, "apps/landing"));
const lbase = `http://127.0.0.1:${lsrv.address().port}`;
for (const m of MODES) {
  const ctx = await context(m, m.dir === "rtl" ? "ar" : "en");
  const page = await ctx.newPage();
  for (const name of ["index", "privacy"]) {
    await page.goto(`${lbase}/${name}.html`, { waitUntil: "networkidle" });
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(out, `landing-${name}-${tag(m)}.png`),
      fullPage: name === "index",
    });
    await check(page, `landing ${name} ${tag(m)}`);
  }
  await ctx.close();
}
lsrv.close();
await browser.close();
console.log(bad ? `\n${bad} problem(s)` : "\nall clean: axe 0 serious/critical, no overflow");
process.exit(bad ? 1 : 0);
