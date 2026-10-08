import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e/deployed",
  timeout: 90_000,
  expect: { timeout: 45_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.DEPLOYED_URL ?? "https://plantuml.brosenius.se/",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
