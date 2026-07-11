import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PORT ?? "3100";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port " + PORT,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      MONGODB_URI: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27117/jobtracker_e2e",
      APPLICATIONS_ROOT: process.env.APPLICATIONS_ROOT ?? "",
      BASE_RESUME_FILENAME: "Base Resume.docx",
      BASE_COVER_LETTER_FILENAME: "Base Cover Letter.docx",
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
