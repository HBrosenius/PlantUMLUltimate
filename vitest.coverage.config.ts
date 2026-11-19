import { defineConfig } from "vitest/config";

// Coverage for the unit and component tests only (`npm run test:coverage`). It mirrors the
// excludes of `npm run test:unit`: the two Workers, which need the Cloudflare test pool, are not
// measured here. Browser (Playwright) coverage is collected separately and merged in by
// `npm run coverage:report`. Both sides use the Istanbul format so their results can be merged.
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
      provider: "istanbul",
      reportsDirectory: "coverage/unit",
      reporter: ["text-summary", "json"],
      include: ["apps/web/src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
      // Web Worker entry points run in a worker thread, where neither the unit runner nor the
      // browser run's page-side collection can read coverage, so they would only show as 0%.
      exclude: ["**/*.test.*", "**/*.d.ts", "**/*.bench.*", "**/*.worker.ts"],
    },
  },
});
