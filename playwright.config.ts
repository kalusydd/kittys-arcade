import { defineConfig, devices } from "@playwright/test";

// Point the tests at a deployed site with PLAYWRIGHT_BASE_URL, otherwise they start the local dev server.
const remoteURL = process.env.PLAYWRIGHT_BASE_URL;
const localURL = "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  // The dev server compiles each route on its first visit, which can take a few seconds.
  expect: { timeout: 10_000 },
  use: {
    baseURL: remoteURL ?? localURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: remoteURL
    ? undefined
    : {
        command: "npm run dev",
        url: localURL,
        reuseExistingServer: !process.env.CI,
      },
});
