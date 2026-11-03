// Shared helpers for BerthIQ's media scripts: drive the real application into
// the states the guided investigation describes, through its own UI.
export const BASE = process.env.BASE ?? "http://localhost:3000";
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("Media is captured from a local server only.");

/** Hides the narrator card so a still shows the product, not the tour. */
export const HIDE_GUIDE = ".story-guide{opacity:0!important;animation:none!important}";

/** Opens the console in story mode and waits for the map and risk model. */
export async function openStory(page) {
  await page.goto(`${BASE}/console?story=1`);
  await page.locator("[data-map-ready=true]").waitFor({ timeout: 60_000 });
  await page.getByText("Loading latest-prefix model predictions…").waitFor({ state: "detached", timeout: 60_000 });
}

/** Advances the guided investigation to chapter `n` (0-based), running the solver and simulator on the way. */
export async function toChapter(page, n, current = 0) {
  for (let i = current; i < n; i++) {
    const solve = page.getByRole("button", { name: "Run the solver" });
    const simulate = page.getByRole("button", { name: "Simulate both plans" });
    if (await solve.isVisible().catch(() => false)) {
      await solve.click();
      await page.getByText(/plan for all \d+ open calls/).first().waitFor({ timeout: 120_000 });
    } else if (await simulate.isVisible().catch(() => false)) {
      await simulate.click();
      await page.getByTestId("verdict").waitFor({ timeout: 180_000 });
    }
    await page.locator(".story-guide").getByRole("button", { name: /^(Next|Finish)$/ }).click();
  }
  return n;
}
