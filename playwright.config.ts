import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["collaboration-live.spec.ts", "**/deployed/**"],
  timeout: process.env.CI ? 75_000 : 30_000,
  expect: { timeout: process.env.CI ? 25_000 : 8_000 },
  retries: process.env.CI ? 1 : 0,
  // Stop a shard with widespread failures rather than spending its full timeout retrying them.
  maxFailures: process.env.CI ? 10 : 0,
  fullyParallel: Boolean(process.env.CI),
  // Keep renderer-heavy contexts serial within each shard to avoid Firefox process crashes.
  workers: 1,
  reporter: process.env.CI ? [["list"], ["./tests/playwright-failure-reporter.ts"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    // Avoid tracing successful first attempts in CI; retain local failure traces.
    trace: process.env.CI ? "on-first-retry" : "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command:
      process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ?? "npm --workspace @plantuml-studio/web run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
