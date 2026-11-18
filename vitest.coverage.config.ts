import { defineConfig } from "vitest/config";

// Coverage for the unit and component tests only (`npm run test:coverage`). It mirrors the
// excludes of `npm run test:unit`: browser tests (Playwright) and the two Workers, which need the
// Cloudflare test pool, are not measured here.
export default defineConfig({
  test: {
    exclude: [
      "**/node_modules/**",
      "tests/e2e/**",
      "apps/collaboration-worker/**",
      "apps/integration-worker/**",
      ".claude/**",
      "graft/**",
    ],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      reporter: ["text-summary", "json-summary", "html"],
      include: ["apps/web/src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
      exclude: ["**/*.test.*", "**/*.d.ts", "**/*.bench.*"],
    },
  },
});
