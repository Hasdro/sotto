// T-082 evidence: node docs/evidence/phase9/review-zoho-scopes/shots.mjs http://127.0.0.1:<port> <admin email> <pw file> <outDir>
// Build with EXPO_PUBLIC_SOTTO_SERVER=http://127.0.0.1:<port>, run `python -m sotto_worker.cloud serve --port <port>` on a scratch SOTTO_DATA_DIR.
// Local only: the web app against a LOCAL server; the Zoho-backed
// endpoints are stubbed in the browser (no real Zoho org is touched).
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium } from "playwright";

const [base, email, pwFile, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const axe = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const ALL = { tasks: true, agn_fields: true, campaigns: true, notifications: true };
const DEAL = "4150868000000400001";
const BRIEF = {
  person: { module: "Contacts", id: "4150868000000224005", name: "Jane Doe", title: "CFO",
    email: "jane@zylker.test", phone: "+971 4 555 0102",
    campaign_info: { name: "Dubai Expo 2026", type: "Trade Show", status: "Active" } },
  account: { name: "Zylker Corp", industry: "Retail" },
  deals: [{ id: DEAL, name: "Zylker renewal", stage: "Qualification", amount: "12000",
    currency: "AED", close_date: "2026-12-01", owner: "Ada Admin" }],
  notes: [], text: "Contact: Jane Doe",
};
const BP = { deal_id: DEAL, process: "Sales process", current: "Qualification",
  transitions: [{ name: "Qualify", to: "Proposal", ready: false,
    missing: [{ api_name: "Budget_Confirmed", label: "Budget confirmed" },
      { api_name: "Decision_Maker", label: "Decision maker" }],
    done: [{ api_name: "Need", label: "Need" }] },
    { name: "Lose", to: "Closed Lost", ready: true, missing: [], done: [] }],
  note: "To move to Proposal: still need Budget confirmed, Decision maker." };
const AGN = [
  { api_name: "AGN_Call_Score", label: "AGN Call Score", type: "integer", exists: false, writable: true },
  { api_name: "AGN_Chance_Band", label: "AGN Chance Band", type: "picklist", exists: false, writable: true },
  { api_name: "AGN_Top_Objection", label: "AGN Top Objection", type: "text", exists: true, writable: true },
  { api_name: "AGN_Last_Call_Date", label: "AGN Last Call Date", type: "date", exists: false, writable: true },
];
const json = (route, body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

async function stub(ctx, mode) {
  const patch = async (route) => {
    const res = await route.fetch();
    const d = await res.json();
    const f = d.features ?? {};
    f.zoho = { state: "available" };
    if (d.features) d.features = f;
    if (mode === "reconnect")
      d.health = { status: "needs_attention", reasons: [{ code: "zoho_scopes_outdated", fix: "/settings#zoho" }] };
    await route.fulfill({ response: res, body: JSON.stringify(d) });
  };
  await ctx.route("**/api/v1/features*", patch);
  await ctx.route("**/api/v1/me", patch);
  await ctx.route("**/api/v1/zoho/status*", (r) => json(r, {
    connected: true, connected_at: Date.now(), api_domain: "https://www.zohoapis.com",
    needs_reconnect: mode === "reconnect", scopes_outdated: mode === "reconnect",
    features: mode === "reconnect" ? {} : ALL, feature: { state: "available" }, client: "platform", dc: "us" }));
  await ctx.route("**/api/v1/company/zoho/client", (r) => json(r, {
    platform: { configured: true, dc: "us" }, org: { configured: false }, active: "platform" }));
  await ctx.route("**/api/v1/zoho/meetings*", (r) => json(r, { meetings: [], page: 1, more: false }));
  await ctx.route("**/api/v1/zoho/search*", (r) => json(r, { candidates: [{ module: "Contacts",
    id: BRIEF.person.id, name: "Jane Doe", title: "CFO", company: "Zylker Corp",
    email: "jane@zylker.test", phone: "+971 4 555 0102", evidence: { field: "name", value: "Jane" } }] }));
  await ctx.route("**/api/v1/zoho/records/**", (r) => json(r, { brief: BRIEF }));
  await ctx.route("**/api/v1/zoho/deals/*/blueprint", (r) => json(r, BP));
  await ctx.route("**/api/v1/zoho/agn-fields", (r) => json(r, { fields: AGN }));
  await ctx.route("**/api/v1/zoho/team*", (r) => json(r, { people: [], fallback: false, seats_left: 3 }));
}

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
const agree = lp.getByText("Agree and continue");
if (await agree.count()) {
  await agree.first().click();
  await lp.waitForTimeout(1000);
}
const state = await login.storageState();
await login.close();

let bad = 0;
async function check(page, name) {
  await page.evaluate(axe);
  const res = await page.evaluate(() => globalThis.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }));
  const sev = res.violations.filter((v) => ["serious", "critical"].includes(v.impact));
  console.log(`${sev.length ? "FAIL" : "ok  "} ${name}`);
  for (const v of sev) console.log(`     ${v.impact}: ${v.id} — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  bad += sev.length;
}
async function shot(page, testId, file) {
  const el = page.getByTestId(testId).first();
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await el.screenshot({ path: join(out, file) });
}

for (const scheme of ["light", "dark"])
  for (const locale of ["en", "ar"])
    for (const width of [1280, 390]) {
      const tag = `${width}-${scheme}-${locale === "ar" ? "rtl" : "ltr"}`;
      const mk = async (mode) => {
        const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width, height: width > 500 ? 900 : 844 }, storageState: state, reducedMotion: "reduce" });
        await ctx.addInitScript((l) => localStorage.setItem("sotto.locale", l), locale);
        await stub(ctx, mode);
        return ctx;
      };
      // 1. reconnect prompt (one banner)
      let ctx = await mk("reconnect");
      let page = await ctx.newPage();
      await page.goto(`${base}/home`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: join(out, `reconnect-${tag}.png`) });
      await check(page, `reconnect ${tag}`);
      await ctx.close();
      // 2. admin: AGN preview + export
      ctx = await mk("ok");
      page = await ctx.newPage();
      await page.goto(`${base}/admin/integrations`, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      await page.getByTestId("agn-preview").click();
      await page.getByTestId("agn-field-AGN_Call_Score").waitFor();
      await page.getByTestId("agn-confirm").click();
      await shot(page, "agn-fields", `agn-fields-${tag}.png`);
      await shot(page, "weekly-export", `export-${tag}.png`);
      await check(page, `admin ${tag}`);
      // 3. rail: campaign + Blueprint
      await page.goto(`${base}/call`, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      for (let i = 0; i < 3; i++) {
        const scrim = page.getByTestId("consent-step-scrim");
        if (!(await scrim.count())) break;
        await scrim.first().click({ force: true });
        await page.waitForTimeout(400);
      }
      if (!(await page.getByTestId("crm-query").count())) {
        await page.getByTestId("rail-toggle").click();
        await page.waitForTimeout(600);
      }
      await page.getByTestId("crm-query").fill("Jane");
      await page.getByTestId("crm-find").click();
      await page.getByTestId(`crm-pick-${BRIEF.person.id}`).click();
      await page.getByTestId("bp-checklist").waitFor();
      await shot(page, "crm-brief", `blueprint-${tag}.png`);
      await check(page, `rail ${tag}`);
      await ctx.close();
    }
await browser.close();
console.log(bad ? `\n${bad} problem(s)` : "\nall clean: axe 0 serious/critical");
process.exit(bad ? 1 : 0);
