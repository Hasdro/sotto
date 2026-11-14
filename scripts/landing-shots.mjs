import { chromium } from "playwright";

const OUT = "apps/landing/";
const BASE = "http://localhost:8099";
const b = await chromium.launch();
async function card(p, text, file) {
  const h = await p
    .getByText(text)
    .first()
    .evaluateHandle((el) => {
      let e = el;
      while (e.parentElement) {
        const s = getComputedStyle(e);
        if (
          parseFloat(s.borderTopLeftRadius) >= 16 &&
          s.backgroundColor !== "rgba(0, 0, 0, 0)" &&
          e.getBoundingClientRect().width > 300
        )
          return e;
        e = e.parentElement;
      }
      return el;
    });
  const box = await h.asElement().boundingBox();
  console.log(file, Math.round(box.width), Math.round(box.height));
  await h.asElement().screenshot({ path: OUT + file });
}
// 1. live call card
let p = await b.newPage({ viewport: { width: 636, height: 900 } });
await p.goto(`${BASE}/call?mock=1`);
await p.waitForTimeout(9000);
await card(p, "District cooling is billed", "shot-call-card.png");
// 2. after-call checklist
await p.getByText("End call").first().click();
await p.waitForTimeout(800);
await p.getByText("End call").last().click();
await p.waitForTimeout(3000);
await p.close();
p = await b.newPage({ viewport: { width: 602, height: 1000 } });
await p.goto(`${BASE}/call?mock=1`);
await p.waitForTimeout(9000);
await p.getByText("End call").first().click();
await p.waitForTimeout(800);
await p.getByText("End call").last().click();
await p.waitForTimeout(3000);
await p.getByText("Edit").nth(1).click();
await p.waitForTimeout(500);
await p.screenshot({ path: "/tmp/after.png", fullPage: true });
await card(p, "Suggested updates", "shot-after-call.png");
await p.close();
// 3. meetings
p = await b.newPage({ viewport: { width: 708, height: 900 } });
await p.goto(`${BASE}/home?mock=1`);
await p.waitForTimeout(8000);
await card(p, "Your upcoming meetings", "shot-meetings.png");
await b.close();
