// Records BerthIQ's showcase film: a ~75-second 16:9 walkthrough at a
// genuine, constant 60 fps, 1920×1080 — the story of one waiting ship, told
// through the real application (real replay, real solver, real simulator).
//   media/berthiq-showcase.mp4        1920×1080, H.264 High, 60 fps
//   media/berthiq-showcase-thumb.jpg  the title frame
//   media/berthiq-showcase-poster.jpg the verdict frame
//   media/berthiq-showcase.gif        an 11-second, 800-px README loop
// Frames come from a virtual clock (lib/frame-capture.mjs), so nothing
// depends on this machine's speed; solver and simulator waits happen off
// camera. Record against a production build so no dev overlay appears:
//   npm run build && npx next start -p 3100   (API on :8000, seeded)
//   BASE=http://localhost:3100 FFMPEG=/path/to/ffmpeg node scripts/media/record-showcase.mjs
// Env: DRAFT=1 skips the GIF and encodes faster.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { launchFramePage, startClock, encodeFrames } from "./lib/frame-capture.mjs";
import { installStage, director, brandCard } from "./lib/stage.mjs";
import { BASE, HIDE_GUIDE } from "./lib/app.mjs";

const W = 1920;
const H = 1080;
const ffmpeg = process.env.FFMPEG ?? "ffmpeg";
const draft = process.env.DRAFT === "1";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "../../..");
const outDir = path.join(root, "media");
const work = path.join(root, "frontend", ".media-work");
fs.mkdirSync(outDir, { recursive: true });

// Every number in a caption is read from the committed evidence, never typed.
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, "frontend", f), "utf8"));
const story = read("lib/fixtures/landing_story.json");
const sim = read("lib/fixtures/simulation_result.example.json");
const [waitBefore, waitAfter] = sim.headline.avg_waiting_time.map((k) => k.value);
const [staffBefore, staffAfter] = sim.tradeoffs.reviewer_staffed_hours.map((k) => k.value);
const N = {
  hours: Math.round(story.hero.anchor_hours),
  returned: story.hero.rejections,
  anchored: story.moment.anchored,
  allIdle: story.moment.idle === story.moment.berths,
  idle: story.moment.idle,
  drop: Math.round((1 - waitAfter / waitBefore) * 100),
  staff: Math.round(staffAfter - staffBefore),
};

const shell = await launchFramePage({ width: W, height: H });
const { page } = shell;
await installStage(page);
const clock = await startClock(shell.cdp, { dir: path.join(work, "frames"), quality: draft ? 85 : 93 });
const d = director(clock, page, { width: W, height: H });
const wait = (ms) => clock.wait(ms);
const guide = () => page.locator(".story-guide");
const next = async () => {
  await guide().getByRole("button", { name: /^(Next|Finish)$/ }).evaluate((el) => el.click());
  await wait(60);
};
const until = async (locator, timeout = 180_000) => locator.first().waitFor({ timeout });
const hideGuide = () => page.addStyleTag({ content: `${HIDE_GUIDE}.next-logo,nextjs-portal{display:none!important}` });

try {
  // ── Off camera: open the console, find the puzzle moment. ────────────────
  await page.goto(`${BASE}/console?story=1`);
  await until(page.locator("[data-map-ready=true]"), 90_000);
  await page.getByText("Loading latest-prefix model predictions…").waitFor({ state: "detached", timeout: 60_000 });
  await d.stage("blackInstant", true);
  await hideGuide();
  await next();
  await wait(400);
  const moment = Number(await page.getByRole("slider", { name: "Simulation clock" }).inputValue());

  // ── 1. Title card ─────────────────────────────────────────────────────────
  await page.goto(`${BASE}/`);
  await page.locator(".hero-case").waitFor();
  await d.stage("cardInstant", brandCard("Why is this ship <em>waiting?</em>", "Port-call decision support · Khalifa Port, Abu Dhabi"));
  await d.stage("blackInstant", false);
  await wait(300);
  clock.record();
  clock.mark("title");
  await wait(2600);
  // ── 2. The hook: one real call, replayed on the landing page ────────────
  await page.evaluate(() => scrollTo(0, 0));
  await page.getByRole("button", { name: "Replay the timeline" }).evaluate((el) => el.click());
  await d.stage("card", null);
  await wait(500);
  // A slow push-in on the whole hero: the question and the counter together.
  const push = d.zoom(1.07, 1180, 470, 7600);
  await d.caption("A REAL CALL FROM THE REFERENCE WEEK", `This ship waited <em>${N.hours} hours</em> at anchor.`);
  await wait(4300);
  await d.caption("THE PUZZLE", `Its paperwork was sent back <em>${N.returned} times.</em> A berth sat idle.`);
  await wait(3000);
  await push;
  await d.uncaption();
  await d.stage("black", true);
  await wait(450);
  await clock.pause();

  // ── 3. The harbor, replayed from the event log ───────────────────────────
  await page.goto(`${BASE}/console?story=1`);
  await until(page.locator("[data-map-ready=true]"), 90_000);
  await page.getByText("Loading latest-prefix model predictions…").waitFor({ state: "detached", timeout: 60_000 });
  await d.stage("blackInstant", true);
  await hideGuide();
  await d.reset(1);
  // Play the 36 replay hours that lead into the puzzle moment (6 h per second).
  await page.getByRole("slider", { name: "Simulation clock" }).evaluate((el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, String(v));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, moment - 36 * 3_600_000);
  await wait(200);
  await page.getByRole("button", { name: "Play replay" }).evaluate((el) => el.click());
  clock.record();
  await d.stage("black", false);
  await d.caption("ONE WEEK AT KHALIFA PORT", "Replayed from the <em>event log.</em>");
  await wait(2200);
  await d.zoom(1.22, 760, 640, 3000);
  await wait(800);
  // ── 4. The puzzle ──────────────────────────────────────────────────────────
  await next();
  await wait(300);
  await d.caption("THE PUZZLE", `${N.anchored} ships at anchor. <em>${N.allIdle ? "Every berth empty." : `${N.idle} berths empty.`}</em>`);
  await wait(3200);
  // ── 5. One ship's two lanes ────────────────────────────────────────────────
  await next();
  await d.uncaption();
  await wait(500);
  await d.frame(page.locator(".context-panel .why"), { fill: 0.82, ms: 1300, max: 1.9 });
  await d.caption("WHY DID IT WAIT?", "Paperwork above. The ship below. <em>One clock.</em>");
  await wait(4600);
  await d.uncaption();
  await d.reset(900);
  // ── 6. The pattern ─────────────────────────────────────────────────────────
  await next();
  await until(page.locator(".finding-card"), 60_000);
  await wait(500);
  await d.frame(page.locator(".finding-card"), { fill: 0.9, ms: 1100, max: 1.5 });
  await d.caption("SIX MONTHS OF HISTORY", "The bottleneck is <em>authority review.</em>");
  await wait(3600);
  await d.uncaption();
  await d.reset(800);
  // ── 7. The forecast ────────────────────────────────────────────────────────
  await next();
  await wait(500);
  await d.frame(page.locator(".board"), { fill: 0.92, ms: 1100, max: 1.35 });
  await d.caption("THE FORECAST", "A model flags who is <em>late next.</em>");
  await wait(3200);
  await d.uncaption();
  await d.reset(800);
  // ── 8. The decision: run the real solver ──────────────────────────────────
  await next();
  await wait(700);
  await d.caption("THE DECISION", "What if the port staffed <em>five reviewers?</em>");
  await wait(1400);
  await d.click(page.getByRole("button", { name: "Save & optimize", exact: true }));
  await wait(400);
  await clock.pause();
  await until(page.getByTestId("solver-status"), 180_000);
  await guide().getByText(/plan for all \d+ open calls/).waitFor({ timeout: 60_000 });
  await d.hideCursor(1);
  await page.locator(".result-summary").evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.evaluate(() => scrollBy(0, -24));
  await wait(400);
  clock.record();
  await d.caption("CP-SAT · OR-TOOLS", "A plan that breaks <em>no hard rule.</em>");
  await d.frame(page.locator(".result-summary"), { fill: 0.9, ms: 1100, max: 1.35 });
  await wait(2600);
  await d.uncaption();
  await d.reset(700);
  // ── 9. The verdict: run the real simulator ────────────────────────────────
  await next();
  const simulate = page.getByRole("button", { name: "Simulate comparison", exact: true });
  await simulate.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await wait(500);
  await d.caption("20 MATCHED SIMULATIONS", "Today’s plan vs. yours, <em>same random delays.</em>");
  await d.click(simulate);
  await wait(400);
  await clock.pause();
  await until(page.getByTestId("verdict"), 240_000);
  await d.hideCursor(1);
  await d.uncaption();
  await page.getByTestId("verdict").evaluate((el) => el.scrollIntoView({ block: "center" }));
  await wait(400);
  clock.record();
  clock.mark("verdict");
  await d.frame(page.getByTestId("verdict"), { fill: 0.94, ms: 1300, max: 1.4 });
  await wait(1800);
  await d.caption("THE VERDICT", `Waits fall ${N.drop}%. It costs <em>${N.staff} reviewer hours.</em>`);
  await wait(4200);
  await d.uncaption();
  // ── 10. End card ───────────────────────────────────────────────────────────
  await d.stage("card", brandCard("Follow one ship from <em>anchor to berth.</em>", "Synthetic operations · real decision models · github.com/abdulaz06/berthiq", "Start the investigation"));
  await wait(4200);
  await clock.pause();
  const { frames, marks } = await clock.stop();
  console.log(`${frames.length} frames · ${(frames.length / 60).toFixed(1)} s`);

  const out = path.join(outDir, "berthiq-showcase.mp4");
  encodeFrames({ ffmpeg, frames, out, crf: draft ? 23 : 17, work: path.join(work, "seq") });
  fs.copyFileSync(frames[marks.title + 90], path.join(outDir, "berthiq-showcase-thumb.jpg"));
  fs.copyFileSync(frames[Math.min(marks.verdict + 260, frames.length - 1)], path.join(outDir, "berthiq-showcase-poster.jpg"));
  if (!draft) {
    // A short loop for the README: the hook, the puzzle and the two lanes.
    const start = (marks.title + 150) / 60;
    const palette = path.join(work, "palette.png");
    execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-ss", String(start), "-t", "11", "-i", out, "-vf", "fps=12,scale=800:-1:flags=lanczos,palettegen=stats_mode=diff", palette]);
    execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-ss", String(start), "-t", "11", "-i", out, "-i", palette, "-lavfi", "fps=12,scale=800:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4", path.join(outDir, "berthiq-showcase.gif")]);
  }
  console.log(`Wrote ${path.relative(root, outDir)}/berthiq-showcase.*`);
} finally {
  await shell.close();
  fs.rmSync(path.join(work, "frames"), { recursive: true, force: true });
}
