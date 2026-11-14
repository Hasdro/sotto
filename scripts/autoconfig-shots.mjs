#!/usr/bin/env node
// T-083 evidence: screenshots + axe of the playbook bootstrap queue (app) and the owner console's
// Routing job, Spend and key rotation, against a LOCAL cloud server with sample data (no vendor
// calls). Usage: node scripts/autoconfig-shots.mjs <base> <out-dir> <admin-email> <password>
//   <owner-email> <owner-password>
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium } from "playwright";

const [base, out, adminEmail, adminPw, ownerEmail, ownerPw] = process.argv.slice(2);
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"));
const browser = await chromium.launch();
let serious = 0;
let checked = 0;

async function axe(page, label) {
  await page.addScriptTag({ content: axeSource.toString() });
  const r = await page.evaluate(async () =>
    globalThis.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    }),
  );
  checked += 1;
  const bad = r.violations.filter((v) => ["serious", "critical"].includes(v.impact));
  serious += bad.length;
  console.log(`${bad.length ? "FAIL" : "ok  "}  ${label}`);
  for (const v of bad) console.log(`      ${v.id}: ${v.help} ${v.nodes[0]?.target.join(" ")}`);
}

// App: the Playbook page with the bootstrap panel and its review queue.
for (const scheme of ["light", "dark"])
  for (const locale of ["en", "ar"])
    for (const width of [1280, 390]) {
      const ctx = await browser.newContext({
        colorScheme: scheme,
        viewport: { width, height: 900 },
        bypassCSP: true, // axe is injected; the page itself keeps its CSP
      });
      await ctx.addInitScript((l) => {
        localStorage.setItem("sotto.locale", l);
        localStorage.setItem("sotto.prefs", JSON.stringify({ playbookHelpSeen: true }));
      }, locale);
      const page = await ctx.newPage();
      await page.goto(`${base}/`, { waitUntil: "networkidle" });
      await page.fill('[data-testid="acct-email"]', adminEmail);
      await page.fill('[data-testid="acct-password"]', adminPw);
      await page.click('[data-testid="acct-submit"]');
      await page.waitForTimeout(2500);
      await page.goto(`${base}/playbook`, { waitUntil: "networkidle" });
      await page.waitForSelector('[data-testid="bootstrap"]', { timeout: 15000 });
      await page.locator('[data-testid="bootstrap"]').scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      const name = `app-bootstrap-${scheme}-${locale}-${width}.png`;
      await page.locator('[data-testid="bootstrap"]').screenshot({ path: join(out, name) });
      await axe(page, `/playbook ${scheme} ${locale} ${width}`);
      await ctx.close();
    }

// Owner console (English only, like the rest of the console).
for (const scheme of ["light", "dark"])
  for (const width of [1280, 390]) {
    const ctx = await browser.newContext({
      colorScheme: scheme,
      viewport: { width, height: 900 },
      bypassCSP: true, // axe is injected; the page itself keeps its CSP
    });
    const page = await ctx.newPage();
    await page.goto(`${base}/owner`, { waitUntil: "networkidle" });
    await page.fill("#email", ownerEmail);
    await page.fill("#password", ownerPw);
    await page.click('#loginForm button[type="submit"]');
    await page.waitForTimeout(1200);
    for (const view of ["routingjob", "spend", "providers"]) {
      await page.click(`.tabs button[data-view="${view}"]`);
      await page.waitForTimeout(700);
      await page.screenshot({
        path: join(out, `owner-${view}-${scheme}-${width}.png`),
        fullPage: true,
      });
      await axe(page, `/owner ${view} ${scheme} ${width}`);
    }
    if (scheme === "light" && width === 1280) {
      // The cap set: the job then waits for golden calls (P0.5).
      await page.click('.tabs button[data-view="routingjob"]');
      await page.fill("#routingCap", "40");
      await page.click("#routingJobSave");
      await page.waitForTimeout(700);
      await page.screenshot({
        path: join(out, "owner-routingjob-cap-set-light-1280.png"),
        fullPage: true,
      });
      await page.click("#routingCapClear");
      await page.waitForTimeout(500);
    }
    await ctx.close();
  }
await browser.close();
console.log(`${checked} checks, ${serious} serious/critical`);
process.exit(serious ? 1 : 0);
