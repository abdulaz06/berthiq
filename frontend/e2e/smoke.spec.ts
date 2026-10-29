import { expect, test } from "@playwright/test";

test("public landing opens the operations console", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Every port call. A clearer decision.", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("link", {name:"Explore the control room"})).toHaveAttribute("href","/console");
});
