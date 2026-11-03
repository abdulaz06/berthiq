import { expect, test } from "@playwright/test";

test("public landing opens the operations console", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Why is this ship waiting?", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("link", {name:"Start the investigation"}).first()).toHaveAttribute("href","/console?story=1");
});
