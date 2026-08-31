import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "collaboration-live.spec.ts",
  timeout: process.env.CI ? 90_000 : 60_000,
  expect: { timeout: process.env.CI ? 20_000 : 10_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command:
        "npx wrangler dev --config apps/collaboration-worker/wrangler.jsonc --ip 127.0.0.1 --port 8787 --persist-to .wrangler/e2e-state --log-level warn",
      url: "http://127.0.0.1:8787/health",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command:
        "VITE_COLLABORATION_URL=http://127.0.0.1:8787 npm --workspace @plantuml-studio/web run dev -- --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
