import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./live-e2e",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `"${process.env.BERTHIQ_PYTHON ?? (process.platform === "win32" ? "../backend/.venv/Scripts/python.exe" : "../backend/.venv/bin/python")}" -m uvicorn app.main:app --app-dir ../backend --port 8000`,
      url: "http://localhost:8000/api/ready",
      env: { ENABLE_UPLOADS: "true" },
      timeout: 60000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run start",
      url: "http://localhost:3000",
      timeout: 60000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
