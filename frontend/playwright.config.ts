import { defineConfig, devices } from "@playwright/test";

/**
 * Placeholder E2E config. The real golden-path (select → … → compare) lands in
 * M1-15; for now one smoke test boots the app and asserts it loads. It runs in
 * fixtures mode, so no backend or Postgres is required in CI.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_USE_FIXTURES: "true",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
