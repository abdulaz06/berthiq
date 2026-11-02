import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("keyboard skip links, vessel detail focus and Escape work on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/console");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to workspace" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#workspace-heading")).toBeFocused();
  const vessel = page.getByRole("button", {
    name: "Select vessel KHL-0595",
    exact: true,
  });
  await expect(vessel).toBeVisible();
  await vessel.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Close vessel details" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Close vessel details" }),
  ).toHaveCount(0);
  await expect(vessel).toBeFocused();
  await page.getByRole("button", { name: "Start guided walkthrough" }).click();
  await expect(
    page.getByRole("region", { name: "Guided walkthrough" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Start guided walkthrough" }),
  ).toBeFocused();
  await page.goto("/case-study");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.locator("#case-study-content")).toBeFocused();
});

test("desktop and mobile routes have no automated WCAG A/AA violations", async ({
  page,
}) => {
  test.setTimeout(120000);
  for (const width of [1920, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
    for (const route of ["/", "/case-study", "/console"]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      if (route === "/console") {
        await expect(
          page.getByRole("button", { name: "Select vessel KHL-0595" }),
        ).toBeVisible();
      }
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect
        .soft(
          results.violations.map((v) => ({
            id: v.id,
            nodes: v.nodes.map((n) => ({
              target: n.target,
              summary: n.failureSummary,
            })),
          })),
          `${width}px ${route}: ${JSON.stringify(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })))}`,
        )
        .toEqual([]);
      if (route === "/case-study")
        await page.screenshot({
          path: `../DOCS/media/case-study-${width === 390 ? "mobile" : "desktop"}.png`,
        });
      if (route === "/case-study") {
        await page.locator("#limitations").scrollIntoViewIfNeeded();
        await page.screenshot({ path: `../DOCS/media/case-study-limits-${width}.png` });
      }
      if (route === "/") {
        await page.locator("#product").scrollIntoViewIfNeeded();
        await page.screenshot({ path: `../DOCS/media/platform-${width}.png` });
      }
    }
    for (const view of ["Risk", "Events", "Process", "Studio", "Data"]) {
      await page
        .locator(".rail")
        .getByRole("button", { name: view, exact: true })
        .click();
      if (view === "Process")
        await expect(page.locator(".react-flow__node").first()).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect
        .soft(
          results.violations.map((v) => ({
            id: v.id,
            nodes: v.nodes.map((n) => ({
              target: n.target,
              summary: n.failureSummary,
            })),
          })),
          `${width}px ${view}: ${JSON.stringify(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })))}`,
        )
        .toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
});
