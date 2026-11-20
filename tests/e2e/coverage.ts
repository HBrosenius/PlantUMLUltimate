import { test as base } from "@playwright/test";
import libCoverage, { type CoverageMap, type CoverageMapData } from "istanbul-lib-coverage";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Every spec imports `test` and `expect` from here instead of "@playwright/test". When the app was
// started with E2E_COVERAGE (see `npm run test:coverage:e2e`), its sources are Istanbul-instrumented
// and this collects `window.__coverage__` from each page, including just before a reload or
// navigation discards it, and writes one merged file per worker to coverage/e2e. Otherwise it does
// nothing. Pages opened from a context the test creates itself are not collected.
export * from "@playwright/test";

const enabled = Boolean(process.env.E2E_COVERAGE);
const outputDirectory = join(process.cwd(), "coverage", "e2e");
let collected: CoverageMap | undefined;

function collect(data: CoverageMapData | undefined) {
  if (!data) return;
  (collected ??= libCoverage.createCoverageMap({})).merge(data);
}

export const test = base.extend<{ collectCoverage: void }, { flushCoverage: void }>({
  flushCoverage: [
    // Playwright reads fixture dependencies from this destructuring pattern, so it must stay.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      await use();
      if (!collected) return;
      mkdirSync(outputDirectory, { recursive: true });
      const name = `${process.env.COVERAGE_SHARD ?? "run"}-worker-${workerInfo.workerIndex}-${process.pid}.json`;
      writeFileSync(join(outputDirectory, name), JSON.stringify(collected.toJSON()));
    },
    { scope: "worker", auto: enabled },
  ],
  collectCoverage: [
    async ({ context }, use) => {
      await context.exposeFunction("__collectCoverage", (json: string) => collect(JSON.parse(json)));
      await context.addInitScript(() => {
        const send = () => {
          const coverage = (window as unknown as { __coverage__?: unknown }).__coverage__;
          const collector = (window as unknown as { __collectCoverage?: (json: string) => void }).__collectCoverage;
          if (coverage && collector) collector(JSON.stringify(coverage));
        };
        window.addEventListener("pagehide", send);
        window.addEventListener("beforeunload", send);
      });
      await use();
      for (const page of context.pages()) {
        collect(
          await page
            .evaluate(() => (window as unknown as { __coverage__?: CoverageMapData }).__coverage__)
            .catch(() => undefined),
        );
      }
    },
    { auto: enabled },
  ],
});
