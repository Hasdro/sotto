#!/usr/bin/env node
// T-081 evidence: the follow-up plan screens against a LOCAL management server seeded with a
// test company (fake Gallabox/SMTP settings that are never contacted), in light/dark, English/
// Arabic (RTL), 1280/390 px, with axe (serious/critical) on each screen.
//   node docs/evidence/phase9/review-followup-automation/shots.mjs http://127.0.0.1:8791 \
//     <admin email> <password file> <seed.json>
// Never point it at production.
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const [base, email, pwFile, seedFile] = process.argv.slice(2);
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base ?? "")) {
  console.error("usage: shots.mjs http://127.0.0.1:<port> <email> <pwFile> <seed.json>");
  process.exit(2);
}
const seed = JSON.parse(readFileSync(seedFile, "utf8"));
const axe = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
mkdirSync(here, { recursive: true });

// One call on this device with a customer line, so the follow-up card and the plan show.
const now = Date.now();
const call = (id, title) => ({
  id,
  started_at: now - 3_600_000,
  ended_at: now - 3_000_000,
  title,
  mode: "live",
  cards: 2,
  p50_ms: 600,
  p95_ms: 900,
  transcript: [
    { kind: "line", speaker: "customer", text: "Please send me the proposal and a reminder.", at_ms: 1000 },
    { kind: "line", speaker: "agent", text: "Of course, I'll send it today.", at_ms: 4000 },
  ],
});
const calls = [call("c-shots-new", "Call with Jane Doe"), call(seed.status_call, "Call with Omar")];

const SCREENS = [
  ["plan-setup", "/history/c-shots-new", "plan-setup"],
  ["message-status", `/history/${seed.status_call}`, "plan-status"],
  ["notification-step", `/home?step=${seed.due_step}`, "due-steps"],
  ["reminders-setting", "/admin/features", null],
  ["attachments", "/admin/attachments", "attachments-settings"],
  ["webhook-setup", "/admin/integrations", "gallabox-webhook"],
];

const browser = await chromium.launch();
const login = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const lp = await login.newPage();
await lp.goto(`${base}/home`, { waitUntil: "networkidle" });
if (!(await lp.getByTestId("acct-email").count())) await lp.getByTestId("acct-switch").click();
await lp.getByTestId("acct-email").fill(email);
await lp.getByTestId("acct-password").fill(readFileSync(pwFile, "utf8").trim());
await lp.getByTestId("acct-submit").click();
await lp.waitForLoadState("networkidle");
await lp.waitForTimeout(1500);
// The wave-3 AI-vendor consent step covers every page for a new admin of this LOCAL test company: agree once.
if (await lp.getByTestId("consent-save").count()) {
  await lp.getByTestId("consent-save").click();
  await lp.waitForTimeout(500);
}
const state = await login.storageState();
await login.close();

let bad = 0;
for (const scheme of ["light", "dark"])
  for (const locale of ["en", "ar"])
    for (const width of [1280, 390]) {
      const ctx = await browser.newContext({
        colorScheme: scheme,
        viewport: { width, height: width > 500 ? 900 : 844 },
        storageState: state,
        reducedMotion: "reduce",
      });
      await ctx.addInitScript(
        ([l, key, value]) => {
          localStorage.setItem("sotto.locale", l);
          localStorage.setItem(key, value);
        },
        [locale, `sotto.calls.${seed.company}.${seed.user}`, JSON.stringify(calls)],
      );
      const page = await ctx.newPage();
      const tag = `${width}-${scheme}-${locale === "ar" ? "rtl" : "ltr"}`;
      for (const [name, path, focus] of SCREENS) {
        await page.goto(base + path, { waitUntil: "networkidle" });
        await page.waitForTimeout(800);
        if (focus) {
          const el = page.getByTestId(focus).first();
          if (await el.count()) await el.scrollIntoViewIfNeeded();
          else console.log(`miss ${name} ${tag}: no ${focus}`);
        }
        await page.screenshot({ path: join(here, `${name}-${tag}.png`), fullPage: false });
        await page.evaluate(axe);
        const res = await page.evaluate(() =>
          globalThis.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }),
        );
        const sev = res.violations.filter((v) => ["serious", "critical"].includes(v.impact));
        console.log(`${sev.length ? "FAIL" : "ok  "} ${name} ${tag}`);
        for (const v of sev)
          console.log(`     ${v.impact}: ${v.id} — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
        bad += sev.length;
      }
      await ctx.close();
    }
await browser.close();
console.log(bad ? `${bad} serious/critical` : "axe: 0 serious/critical");
process.exit(bad ? 1 : 0);
