#!/usr/bin/env node
// T-086 evidence: the web admin panel signed in against a LOCAL management server, in light/dark,
// English/Arabic (RTL), 1280/390 px, with axe (serious/critical) on every page.
//   EXPO_PUBLIC_SOTTO_SERVER=http://127.0.0.1:8788 pnpm --filter @sotto/app export:web
//   (cd apps/agent-worker && uv run python -m sotto_worker.cloud serve)   # serves apps/app/dist
//   node scripts/admin-shots.mjs http://127.0.0.1:8788 <admin email> <password file> [outDir]
// Never point it at production: it signs in with a test admin of a local company.
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const [base, email, pwFile, outArg] = process.argv.slice(2);
if (!base || !email || !pwFile || !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base)) {
  console.error("usage: node scripts/admin-shots.mjs http://127.0.0.1:<port> <email> <pwFile>");
  process.exit(2);
}
const out = resolve(outArg ?? join(root, "docs/design/screens/panels"));
mkdirSync(out, { recursive: true });
const axe = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const PAGES = [
  "/admin",
  "/admin/integrations",
  "/admin/keys",
  "/admin/instructions",
  "/admin/settings",
  "/admin/features",
  "/admin/company",
];
const browser = await chromium.launch();

// Sign in once through the app's own form; reuse the session for every mode.
const login = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const lp = await login.newPage();
await lp.goto(`${base}/admin`, { waitUntil: "networkidle" });
const signIn = lp.getByTestId("acct-email");
if (!(await signIn.count())) {
  // The gate may open on "create"; switch to sign in.
  await lp.getByTestId("acct-switch").click();
}
await lp.getByTestId("acct-email").fill(email);
await lp.getByTestId("acct-password").fill(readFileSync(pwFile, "utf8").trim());
await lp.getByTestId("acct-submit").click();
await lp.waitForLoadState("networkidle");
await lp.waitForTimeout(1500);
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
      await ctx.addInitScript((l) => localStorage.setItem("sotto.locale", l), locale);
      const page = await ctx.newPage();
      const tag = `${width}-${scheme}-${locale === "ar" ? "rtl" : "ltr"}`;
      for (const path of PAGES) {
        await page.goto(base + path, { waitUntil: "networkidle" });
        await page.waitForTimeout(600);
        const name = path === "/admin" ? "team" : path.split("/").pop();
        await page.screenshot({ path: join(out, `admin-${name}-${tag}.png`), fullPage: true });
        await page.evaluate(axe);
        const res = await page.evaluate(() =>
          globalThis.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }),
        );
        const sev = res.violations.filter((v) => ["serious", "critical"].includes(v.impact));
        console.log(`${sev.length ? "FAIL" : "ok  "} admin ${name} ${tag}`);
        for (const v of sev)
          console.log(
            `     ${v.impact}: ${v.id} — ${v.nodes
              .map((n) => n.target.join(" "))
              .slice(0, 3)
              .join(" | ")}`,
          );
        bad += sev.length;
      }
      await ctx.close();
    }
await browser.close();
console.log(bad ? `\n${bad} problem(s)` : "\nall clean: axe 0 serious/critical");
process.exit(bad ? 1 : 0);
