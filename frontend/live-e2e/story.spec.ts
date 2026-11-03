import { test, expect } from "@playwright/test";

test("the guided investigation drives the real console from harbor to verdict", async ({ page }) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/console?story=1");
  const guide = page.getByRole("region", { name: "Guided investigation" });
  const next = guide.getByRole("button", { name: "Next", exact: true });
  await expect(guide.getByRole("heading", { name: "A week at Khalifa Port" })).toBeVisible();
  await expect(page.locator("[data-map-ready=true]")).toHaveCount(1, { timeout: 30000 });

  await next.click();
  await expect(guide.getByRole("heading", { name: /Ships wait/ })).toBeVisible();
  await expect(guide).toContainText(/\d ships are at anchor — and \d of \d berths are free/);

  await next.click();
  // The protagonist's own timeline explains the wait from recorded events.
  await expect(page.locator(".why-headline")).toContainText(/waited \d+ hours at anchor/);
  await expect(page.locator(".why-detail")).toContainText("Authority review returned its documents");
  await expect(page.locator(".journey .ship-anchor").first()).toBeVisible();

  await next.click();
  await expect(page.locator(".finding-card h3")).toHaveText("Authority review", { timeout: 30000 });
  await expect(page.locator(".process-evidence h3")).toHaveText("Authority review");

  await next.click();
  await expect(page.locator(".risk-row.selected-row")).toBeVisible();
  await expect(guide).toContainText(/\d+% chance it misses its service window/);

  await next.click();
  await guide.getByRole("button", { name: "Run the solver" }).click();
  await expect(guide).toContainText(/plan for all \d+ open calls/, { timeout: 90000 });
  await expect(page.getByTestId("solver-status")).toHaveText(/OPTIMAL|FEASIBLE/);

  await next.click();
  await guide.getByRole("button", { name: "Simulate both plans" }).click();
  await expect(page.getByTestId("verdict")).toBeVisible({ timeout: 120000 });
  // The narrator quotes the same verdict the results panel shows, cost included.
  const headline = await page.getByTestId("verdict").locator("h4").textContent();
  await expect(guide.getByRole("heading", { level: 2 })).toHaveText(headline!);
  await expect(guide).toContainText("Reviewer time staffed");
  await expect(page.getByTestId("verdict").locator('[data-provenance="simulated"]')).toBeVisible();

  await next.click();
  await guide.getByRole("button", { name: "Finish" }).click();
  await expect(guide).toHaveCount(0);
  const secret = await page.evaluate(() => sessionStorage.getItem("berthiq-session"));
  await page.request.delete("http://localhost:8000/api/demo/session", { headers: { "X-Demo-Session": secret! } });
});

test("replay moves ships continuously instead of teleporting", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/console");
  await expect(page.locator("[data-map-ready=true]")).toHaveCount(1, { timeout: 30000 });
  const slider = page.getByRole("slider", { name: "Simulation clock" });
  const min = Number(await slider.getAttribute("min"));
  const max = Number(await slider.getAttribute("max"));
  const set = (t: number) =>
    slider.evaluate((el, v) => {
      const input = el as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, String(v));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, t);
  // Find a ship under pilotage, then step the clock by one minute at a time.
  const position = (label: string) =>
    page.getByRole("button", { name: label, exact: true }).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return [r.x + r.width / 2, r.y + r.height / 2];
    });
  let found: { label: string; t: number } | null = null;
  for (let t = min; t < max && !found; t += 20 * 60_000) {
    await set(t);
    const moving = page.locator(".vessel-marker.phase-pilotage").first();
    if (await moving.count()) found = { label: (await moving.getAttribute("aria-label"))!, t };
  }
  expect(found).not.toBeNull();
  let previous = await position(found!.label);
  for (let i = 1; i <= 10; i++) {
    await set(found!.t + i * 60_000);
    const now = await position(found!.label);
    // A minute of replay never jumps a ship across the harbor.
    expect(Math.hypot(now[0] - previous[0], now[1] - previous[1])).toBeLessThan(40);
    previous = now;
  }
});
