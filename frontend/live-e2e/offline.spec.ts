import { test, expect } from "@playwright/test";

const API = "http://localhost:8000";

test("landing page and case study make zero API calls", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith(API)) calls.push(request.url());
  });
  await page.route(`${API}/**`, (route) => route.abort());
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Why is this ship waiting?");
  await expect(page.locator(".hero-case")).toContainText("hours");
  await page.goto("/case-study");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("hours with an empty berth in sight");
  await page.waitForLoadState("networkidle");
  expect(calls).toEqual([]);
});

test("console shows a calm offline panel when the engine is unreachable", async ({ page }) => {
  await page.route(`${API}/**`, (route) => route.abort());
  await page.goto("/console");
  const panel = page.getByRole("alert", { name: "The live engine is offline right now" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("link", { name: /Watch the 60-second film/ })).toHaveAttribute(
    "href",
    /berthiq-showcase\.mp4$/,
  );
  await expect(panel.getByRole("link", { name: "Read the engineering story" })).toHaveAttribute("href", "/case-study");

  // The engine comes back: retrying restores the live console.
  await page.unrouteAll();
  await panel.getByRole("button", { name: /Try the engine again/ }).click();
  await expect(page.getByRole("heading", { name: "On the radar" })).toBeVisible();
});
