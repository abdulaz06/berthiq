// Renders BerthIQ's graphics kit from the HTML/CSS templates beside this file:
//   media/brand/*.jpg                         JPEG q90, each under 1 MB
//   app/opengraph-image.jpg, twitter-image.jpg            (og-home)
//   app/case-study/opengraph-image.jpg, twitter-image.jpg (og-case-study)
// Every card renders at exactly its size; only the README hero renders at 2x.
// The cards show real UI only: crops/ holds element screenshots of the running
// application. Refresh them first with the API on :8000 and Next on :3000:
//   CAPTURE=1 node scripts/media/cards/render-cards.mjs
// Without CAPTURE it re-renders from the committed crops (`just cards`); CAPTURE=only
// refreshes the crops without rendering. ONLY=og-home,square renders a subset.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { BASE, HIDE_GUIDE, openStory, toChapter } from "../lib/app.mjs";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1"));
const frontend = path.resolve(here, "../../..");
const repo = path.resolve(frontend, "..");
const crops = path.join(here, "crops");
const brand = path.join(repo, "media", "brand");
const LIMIT = 1_000_000;

export const CARDS = [
  { name: "og-home", width: 1200, height: 630, install: ["app/opengraph-image", "app/twitter-image"] },
  { name: "og-case-study", width: 1200, height: 630, install: ["app/case-study/opengraph-image", "app/case-study/twitter-image"] },
  { name: "github-social", width: 1280, height: 640 },
  { name: "linkedin-post", width: 1080, height: 1350 },
  { name: "square", width: 1080, height: 1080 },
  { name: "video-thumbnail", width: 1280, height: 720 },
  { name: "readme-hero", width: 1600, height: 800, scale: 2 },
];

/** Element screenshots of the real application, stored as WebP for the templates. */
async function capture(browser) {
  fs.mkdirSync(crops, { recursive: true });
  const meta = {};
  const save = async (name, png) => {
    const img = sharp(png);
    const { width, height } = await img.metadata();
    await img.webp({ quality: 90 }).toFile(path.join(crops, `${name}.webp`));
    meta[name] = { width, height };
  };
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  try {
    // The harbor at the start of the reference week: seven ships at anchor, empty berths.
    const page = await ctx.newPage();
    await openStory(page);
    await page.addStyleTag({ content: HIDE_GUIDE });
    await toChapter(page, 1);
    await page.waitForTimeout(1800);
    // The map's left 850×400 px: the port name, the anchorage and the berths, clear of the overlays.
    const mapClip = async () => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(400);
      const map = await page.locator(".port-map").boundingBox();
      return { x: map.x + 10, y: map.y + 10, width: 850, height: 400 };
    };
    let clip = await mapClip();
    await save("harbor", await page.screenshot({ clip }));
    // The same view with KHL-0592 selected: highlighted at anchor, its path to the berth drawn.
    await page.getByRole("button", { name: /KHL-0592/ }).first().click();
    await page.waitForTimeout(2500);
    clip = await mapClip();
    const ship = await page.locator(".vessel-marker.selected, .vessel-marker[aria-pressed=true]").first().boundingBox().catch(() => null);
    await save("harbor-0592", await page.screenshot({ clip }));
    if (ship) meta["harbor-0592"] = { ...meta["harbor-0592"], ship: { x: (ship.x + ship.width / 2 - clip.x) / clip.width, y: (ship.y + ship.height / 2 - clip.y) / clip.height } };
    // The verdict after the solver and 20 matched simulations.
    const story = await ctx.newPage();
    await openStory(story);
    await story.addStyleTag({ content: HIDE_GUIDE });
    await toChapter(story, 7);
    const verdict = story.getByTestId("verdict");
    await verdict.scrollIntoViewIfNeeded();
    await story.waitForTimeout(1200);
    await save("verdict", await verdict.screenshot());
    // KHL-0592's two-lane "why" timeline, as the landing page shows it.
    await page.goto(`${BASE}/`);
    await page.waitForTimeout(8000);
    await save("why", await page.locator(".hero-case").screenshot());
  } finally {
    await ctx.close();
  }
  const file = path.join(crops, "crops.json");
  const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  fs.writeFileSync(file, `${JSON.stringify({ ...previous, ...meta }, null, 2)}\n`);
}

async function render(browser) {
  fs.mkdirSync(brand, { recursive: true });
  const only = process.env.ONLY?.split(",");
  for (const card of CARDS.filter((c) => !only || only.includes(c.name))) {
    const scale = card.scale ?? 1;
    const ctx = await browser.newContext({ viewport: { width: card.width, height: card.height }, deviceScaleFactor: scale });
    const page = await ctx.newPage();
    await page.goto(pathToFileURL(path.join(here, `${card.name}.html`)).href);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((img) => img.decode()));
    });
    // Text must sit wholly inside the card, above the 8 px signal rule, and never wrap past its box.
    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll("[data-fit]")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight - 8 || el.scrollWidth > el.clientWidth + 1;
        })
        .map((el) => el.textContent.trim().slice(0, 40)),
    );
    if (clipped.length) throw new Error(`${card.name}: clipped text: ${clipped.join(" | ")}`);
    const out = path.join(brand, `${card.name}.jpg`);
    await page.screenshot({ path: out, type: "jpeg", quality: 90 });
    await ctx.close();
    const size = fs.statSync(out).size;
    if (size > LIMIT) throw new Error(`${card.name}.jpg is ${size} bytes, over 1 MB`);
    const alt = fs.readFileSync(path.join(here, `${card.name}.alt.txt`), "utf8").trim();
    for (const target of card.install ?? []) {
      fs.copyFileSync(out, path.join(frontend, `${target}.jpg`));
      // Next copies the file verbatim into og:image:alt, so no trailing newline.
      fs.writeFileSync(path.join(frontend, `${target}.alt.txt`), alt);
    }
    console.log(`${card.name}.jpg  ${card.width * scale}×${card.height * scale}  ${(size / 1024).toFixed(0)} KB`);
  }
}

const browser = await chromium.launch();
try {
  if (process.env.CAPTURE) await capture(browser);
  if (process.env.CAPTURE !== "only") await render(browser);
} finally {
  await browser.close();
}
