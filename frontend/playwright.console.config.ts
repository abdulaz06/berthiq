import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./live-e2e", timeout: 60000, workers: 1,
  use: { baseURL: "http://localhost:3000", screenshot: "only-on-failure" },
});
