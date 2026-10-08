import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";

// Runner shutdowns can prevent Playwright's final failure summary and artifact
// upload. Write each failure immediately so its cause survives in the CI log.
export default class FailureReporter implements Reporter {
  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status === "passed" || result.status === "skipped") return;
    console.error(`\nFAILED: ${test.titlePath().join(" > ")} (${result.status})`);
    for (const error of result.errors)
      console.error((error.message ?? error.value ?? "Unknown failure").slice(0, 6000));
  }
}
