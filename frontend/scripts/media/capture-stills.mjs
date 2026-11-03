// Captures BerthIQ's product stills from the real, running application:
//   public/images/step-*.png   the landing page's four investigation steps
//   ../DOCS/media/*.png         README and case-study screenshots
// Every state is reached through the guided investigation's own UI, so the
// stills always show what a visitor would see. Needs `just dev` (or the API on
// :8000 and Next on :3000) with the seeded reference dataset.
// Usage: node scripts/media/capture-stills.mjs
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { BASE, HIDE_GUIDE, openStory, toChapter } from "./lib/app.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "../..");
const pub = (f) => path.join(root, "public", "images", f);
const docs = (f) => path.join(root, "..", "DOCS", "media", f);
const settle = (page, ms = 1200) => page.waitForTimeout(ms);
const sizes = {};
/** A still cropped to the element that makes the point, padded a little. */
async function crop(page, selector, file, pad = 0) {
  const box = await page.locator(selector).first().boundingBox();
  const clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + pad * 2, height: box.height + pad * 2 };
  await page.screenshot({ path: pub(file), clip });
  sizes[file] = { width: Math.round(clip.width), height: Math.round(clip.height) };
}

const browser = await chromium.launch();
try {
  // Landing steps: a 1600×1000 layout at 1.25× for crisp, compact images.
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.25 });
  const page = await ctx.newPage();
  await openStory(page);
  await page.addStyleTag({ content: HIDE_GUIDE });
  let at = await toChapter(page, 1);
  await settle(page, 1800);
  await crop(page, ".main-panel", "step-harbor.png");
  await page.screenshot({ path: docs("harbor-desktop.png") });
  at = await toChapter(page, 2, at);
  await settle(page, 1800);
  await crop(page, ".context-panel", "step-why.png");
  await page.screenshot({ path: docs("why-desktop.png") });
  at = await toChapter(page, 3, at);
  await page.locator(".finding-card").waitFor({ timeout: 60_000 });
  await settle(page, 1500);
  await page.screenshot({ path: docs("process-desktop.png") });
  at = await toChapter(page, 4, at);
  await settle(page);
  await crop(page, ".main-panel", "step-risk.png");
  at = await toChapter(page, 7, at);
  await page.getByTestId("verdict").scrollIntoViewIfNeeded();
  await page.evaluate(() => scrollBy(0, -140));
  await settle(page);
  await crop(page, '[data-testid="verdict"]', "step-verdict.png", 12);
  await page.screenshot({ path: docs("verdict-desktop.png") });
  await ctx.close();
  fs.writeFileSync(pub("steps.json"), `${JSON.stringify(sizes, null, 2)}
`);

  // Public pages and a phone-sized console for the README.
  const wide = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const landing = await wide.newPage();
  await landing.goto(`${BASE}/`);
  await settle(landing, 8000);
  await landing.screenshot({ path: docs("landing-desktop.png") });
  await wide.close();

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mobile = await phone.newPage();
  await openStory(mobile);
  await mobile.addStyleTag({ content: HIDE_GUIDE });
  await toChapter(mobile, 2);
  await settle(mobile, 1800);
  await mobile.screenshot({ path: docs("why-mobile.png") });
  const home = await phone.newPage();
  await home.goto(`${BASE}/`);
  await settle(home, 8000);
  await home.screenshot({ path: docs("landing-mobile.png") });
  await phone.close();
  console.log("Stills written to public/images and DOCS/media.");
} finally {
  await browser.close();
}
