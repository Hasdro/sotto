const { chromium } = require("playwright");
const axe = require("node:fs").readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const report = [];
async function check(page, label) {
  await page.addScriptTag({ content: axe });
  const r = await page.evaluate(
    async () => await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] }),
  );
  const bad = r.violations.filter((v) => ["serious", "critical"].includes(v.impact));
  report.push(
    `${label}: ${bad.length} serious/critical` +
      bad.map((v) => ` [${v.id}: ${v.nodes.length}]`).join(""),
  );
}
const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path");
const [dist, out, tokenList] = process.argv.slice(2);
const tokens = tokenList.split(",");
let n = 0;
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".json": "application/json",
};
const server = http.createServer((req, res) => {
  const p = path.normalize(decodeURIComponent(req.url.split("?")[0]));
  let f = path.join(dist, p);
  try {
    if (fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
    fs.statSync(f);
  } catch {
    if (path.extname(p)) return res.writeHead(404).end();
    f = path.join(dist, "index.html");
  }
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
  res.end(fs.readFileSync(f));
});
const MODES = [
  ["light", "en"],
  ["dark", "en"],
  ["light", "ar"],
];
(async () => {
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  fs.mkdirSync(out, { recursive: true });
  const shot = async (page, name) => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(out, name), fullPage: true });
    console.log(name);
  };
  try {
    for (const width of [1280, 390])
      for (const [scheme, locale] of MODES) {
        const ctx = await browser.newContext({
          colorScheme: scheme,
          viewport: { width, height: width > 500 ? 2300 : 3600 },
          deviceScaleFactor: 1,
        });
        await ctx.addInitScript(
          ([l, t]) => {
            localStorage.setItem("sotto.locale", l);
            localStorage.setItem("sotto.token", t);
            localStorage.setItem("sotto.prefs", JSON.stringify({ tutorialDone: true }));
          },
          [locale, tokens[n++]],
        );
        const page = await ctx.newPage();
        const tag = `${width}-${scheme}-${locale}`;
        await page.goto(base + "/admin/integrations", { waitUntil: "networkidle" });
        try {
          await page.getByTestId("smtp-settings").waitFor({ timeout: 8000 });
        } catch (e) {
          await page.screenshot({ path: path.join(out, "../debug.png") });
          console.log((await page.innerText("body")).slice(0, 500));
          throw e;
        }
        await page.waitForTimeout(800);
        await page.getByTestId("smtp-test").click();
        await page.getByTestId("smtp-test-result").waitFor();
        await page.getByTestId("gallabox-load").click();
        await page.getByTestId("gallabox-picker").waitFor();
        await page.waitForTimeout(500);
        await page
          .getByTestId("smtp-settings")
          .screenshot({ path: path.join(out, `integrations-smtp-${tag}.png`) });
        await page
          .getByTestId("gallabox-settings")
          .screenshot({ path: path.join(out, `integrations-gallabox-${tag}.png`) });
        await check(page, `/admin/integrations ${tag} (templates loaded)`);
        console.log("integrations", tag);
        await page.goto(base + "/dev-messaging", { waitUntil: "networkidle" });
        await page.getByTestId("email-preview").waitFor();
        await page.waitForTimeout(800);
        await page.getByTestId("email-preview").click();
        await page.getByTestId("email-preview-box").waitFor();
        await page.getByTestId("whatsapp-param-date").fill("Tuesday 17 Nov");
        await page.getByTestId("whatsapp-preview").click();
        await page.getByTestId("whatsapp-preview-box").waitFor();
        await page.waitForTimeout(500);
        await page
          .getByTestId("email-action")
          .screenshot({ path: path.join(out, `email-preview-${tag}.png`) });
        await page
          .getByTestId("whatsapp-action")
          .screenshot({ path: path.join(out, `whatsapp-preview-${tag}.png`) });
        await check(page, `email+whatsapp previews ${tag}`);
        console.log("previews", tag);
        await ctx.close();
      }
  } finally {
    await browser.close();
    server.close();
    require("node:fs").writeFileSync(path.join(out, "axe.txt"), report.join("\n") + "\n");
    console.log(report.join("\n"));
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
