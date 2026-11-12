#!/usr/bin/env node
// Screenshots + axe for apps/landing (T-066). node scripts/landing-check.mjs [outDir]
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const dir = join(root, "apps/landing");
const out = resolve(process.argv[2] ?? join(root, "docs/evidence/phase9/landing"));
const axe = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const T = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const srv = createServer((q, r) => {
  try { const p = q.url === "/" ? "/index.html" : q.url.split("?")[0]; r.setHeader("content-type", T[extname(p)] ?? "text/plain"); r.end(readFileSync(join(dir, p))); }
  catch { r.statusCode = 404; r.end(); }
}).listen(0);
const base = `http://127.0.0.1:${srv.address().port}`;
const b = await chromium.launch();
let bad = 0;
const runs = [
  ["light-1280", "light", "en", 1280, 900], ["dark-1280", "dark", "en", 1280, 900],
  ["light-390", "light", "en", 390, 844], ["dark-390", "dark", "en", 390, 844],
  ["rtl-light-1280", "light", "ar", 1280, 900], ["rtl-dark-390", "dark", "ar", 390, 844],
];
for (const [name, scheme, lang, w, h] of runs) {
  for (const page of ["index", "privacy", "terms"]) {
    const ctx = await b.newContext({ colorScheme: scheme, viewport: { width: w, height: h }, locale: lang });
    const pg = await ctx.newPage();
    await pg.goto(`${base}/${page}.html`);
    await pg.waitForTimeout(300);
    if (page === "index") await pg.screenshot({ path: join(out, `${name}.png`), fullPage: true });
    await pg.evaluate(axe);
    const res = await pg.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] }));
    const sev = res.violations.filter((v) => ["serious", "critical"].includes(v.impact));
    const overflow = await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    console.log(`${name} ${page}: serious/critical=${sev.length} overflow=${overflow}`);
    for (const v of sev) console.log("  ", v.id, v.nodes.map((n) => n.target.join(" ")).join(" | "));
    bad += sev.length + (overflow ? 1 : 0);
    await ctx.close();
  }
}
await b.close(); srv.close();
process.exit(bad ? 1 : 0);
