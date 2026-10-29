import { test, expect } from "@playwright/test";

test("desktop console loads real events, selects a call and replays", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/console");
  await expect(page.getByRole("heading", { name: "On the radar" })).toBeVisible();
  await expect(page.locator("[data-map-ready=true]")).toHaveCount(1, { timeout: 30000 });
  await expect(page.getByText("Loading latest-prefix model predictions…")).toHaveCount(0, { timeout: 30000 });
  await expect(page.locator(".vessel-marker").first()).toBeVisible();
  for (const marker of await page.locator(".berth-marker").all()) await expect(marker).toBeInViewport();
  await page.locator(".vessel-list button").first().click();
  await expect(page.getByText("SELECTED PORT CALL")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Supporting events" })).toBeVisible();
  await page.screenshot({ path: "../DOCS/media/console-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Close vessel details" }).click();
  const before = await page.getByRole("slider", { name: "Simulation clock" }).inputValue();
  await page.getByRole("button", { name: "Reset replay" }).click();
  expect(await page.getByRole("slider", { name: "Simulation clock" }).inputValue()).not.toBe(before);
  await page.getByRole("button", { name: "Play replay" }).click();
  await expect(page.getByRole("button", { name: "Pause replay" })).toBeVisible();
  await page.getByRole("button", { name: "Pause replay" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("local schematic remains usable when public tiles fail", async ({ page }) => {
  await page.route("https://tiles.openfreemap.org/**", route => route.abort());
  await page.goto("/console");
  await expect(page.getByText("Local schematic · approximate coastline and berths")).toBeVisible({ timeout: 15000 });
  await expect(page.locator("[data-map-ready=true]")).toHaveCount(1);
  await page.getByRole("button", { name: "Inspect berth KCT-1", exact: true }).click();
  await expect(page.getByText("BERTH CONSTRAINTS")).toBeVisible();
});

test("mobile has touch navigation and a vessel detail sheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/console");
  await expect(page.getByRole("heading", { name: "On the radar" })).toBeVisible();
  await page.locator(".rail").getByRole("button", { name: "Risk", exact: true }).click();
  await expect(page.locator(".risk-row").first()).toBeVisible({ timeout: 30000 });
  await page.locator(".risk-row").first().click();
  await expect(page.getByText("SELECTED PORT CALL")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "../DOCS/media/console-mobile.png" });
  await page.getByRole("button", { name: "Close vessel details" }).click();
  await expect(page.locator(".detail-open")).toHaveCount(0);
});
