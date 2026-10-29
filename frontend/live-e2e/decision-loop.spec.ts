import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("real discovery, optimization, matched simulation and private export", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/console");
  await expect(
    page.getByRole("heading", { name: "On the radar" }),
  ).toBeVisible();
  await page
    .locator(".rail")
    .getByRole("button", { name: "Process", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Where the process slows" }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".react-flow__node")).toHaveCount(9);
  await page.locator(".bottleneck-row").first().click();
  await expect(page.locator(".process-evidence h3")).toContainText(
    "Authority review",
  );
  await page.screenshot({ path: "../DOCS/media/process-explorer.png" });
  await page
    .locator(".rail")
    .getByRole("button", { name: "Studio", exact: true })
    .click();
  await page
    .getByLabel("Study name", { exact: true })
    .fill("Browser verified capacity study");
  await page
    .getByRole("button", { name: "Save & optimize", exact: true })
    .click();
  await expect(page.getByTestId("solver-status")).toHaveText(
    /OPTIMAL|FEASIBLE/,
    { timeout: 60000 },
  );
  await expect(page.locator(".schedule-block.proposed")).toHaveCount(26);
  await page.locator(".schedule-block.proposed").first().click();
  await expect(page.locator(".assignment-detail")).toContainText("KHL-");
  await page
    .getByRole("button", { name: "FIFO baseline", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "FIFO baseline", exact: true }),
  ).toHaveClass(/active/);
  await page
    .getByRole("button", { name: "Proposed plan", exact: true })
    .click();
  await page.locator(".result-summary").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "../DOCS/media/scenario-studio.png" });
  await page
    .getByRole("button", { name: "Simulate comparison", exact: true })
    .click();
  await expect(page.getByTestId("simulation-results")).toBeVisible({
    timeout: 60000,
  });
  await expect(
    page
      .getByTestId("simulation-results")
      .locator('[data-provenance="simulated"]')
      .first(),
  ).toBeVisible();
  await page.getByTestId("simulation-results").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "../DOCS/media/simulation-comparison.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("simulation-results").scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "../DOCS/media/scenario-mobile.png" });
  await page.setViewportSize({ width: 1920, height: 1080 });
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export evidence", exact: true })
    .click();
  const file = await (await downloadPromise).path();
  expect(file).toBeTruthy();
  const payload = JSON.parse(await readFile(file!, "utf8"));
  expect(payload.scenario.spec.constraints.reviewer_count).toBe(5);
  const optimization = payload.runs.find(
    (r: { kind: string }) => r.kind === "optimization",
  ).result;
  expect(Object.values(optimization.constraint_checks).every(Boolean)).toBe(
    true,
  );
  const simulation = payload.runs.find(
    (r: { kind: string }) => r.kind === "simulation",
  ).result;
  expect(simulation.replications).toBe(20);
  expect(simulation.replication_seeds).toHaveLength(20);
  expect(simulation.seed).toBe(20260601);
  const waiting = simulation.headline.avg_waiting_time;
  expect(waiting[0].provenance).toBe("simulated");
  expect(waiting[1].value).toBeLessThan(waiting[0].value);
  const secret = await page.evaluate(() =>
    sessionStorage.getItem("berthiq-session"),
  );
  const id = payload.scenario.id;
  const anonymous = await page.request.get(
    `http://localhost:8000/api/scenarios/${id}/export`,
  );
  expect(anonymous.ok()).toBe(false);
  await page.reload();
  await page
    .locator(".rail")
    .getByRole("button", { name: "Studio", exact: true })
    .click();
  await expect(
    page.getByLabel("Load saved scenario").locator(`option[value="${id}"]`),
  ).toHaveCount(1);
  await page.getByLabel("Load saved scenario").selectOption(id);
  await expect(page.getByTestId("simulation-results")).toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem("berthiq-session")),
  ).toBe(secret);
  // Clean only this test's private session; never delete shared data.
  const reset = await page.request.delete(
    "http://localhost:8000/api/demo/session",
    { headers: { "X-Demo-Session": secret! } },
  );
  expect(reset.status()).toBe(204);
});

test("incompatible berth lock reports infeasibility without simulated outcomes", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/console");
  await page
    .locator(".rail")
    .getByRole("button", { name: "Studio", exact: true })
    .click();
  await page.getByText("Priorities & berth locks", { exact: true }).click();
  await page.getByLabel("Lock berth for KHL-0595").selectOption("KGT-2");
  await page
    .getByRole("button", { name: "Save & optimize", exact: true })
    .click();
  await expect(page.getByTestId("solver-status")).toHaveText("INFEASIBLE", {
    timeout: 60000,
  });
  await expect(
    page.getByText("These constraints cannot produce a feasible schedule.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Simulate comparison", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const secret = await page.evaluate(() =>
    sessionStorage.getItem("berthiq-session"),
  );
  await page.request.delete("http://localhost:8000/api/demo/session", {
    headers: { "X-Demo-Session": secret! },
  });
});
