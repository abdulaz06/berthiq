import { expect, test } from "@playwright/test";

test("app loads and renders the BerthIQ dashboard", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "BerthIQ", level: 1 }),
  ).toBeVisible();
  await expect(page.getByTestId("health-status")).toBeVisible();
});
