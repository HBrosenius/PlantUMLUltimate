import { expect, it } from "vitest";
import { diagnosticsForDiagram, quickFixesForDiagram } from "./diagram-diagnostics";
import { remainingRepairSummary } from "./remaining-repair-summary";

it("counts choices and manual errors after a batch without counting warnings", () => {
  const source = "@startgantt\n[A] lasts 5\n[B] lasts 2\n[C] lasts -2 days\n@endgantt";
  const diagnostics = diagnosticsForDiagram("gantt", source);
  expect(
    remainingRepairSummary(
      "gantt",
      source,
      [...diagnostics, { from: 0, to: 1, severity: "warning", message: "Warning" }],
      quickFixesForDiagram("gantt", source),
    ),
  ).toBe("3 errors remain: 2 need a choice, 1 needs manual editing.");
});

it("distinguishes a single correction needing review from alternative choices", () => {
  const source = "@startgantt\n[A] lasts 2 days and 50% completed\n@endgantt";
  const fixes = quickFixesForDiagram("gantt", source);
  expect(remainingRepairSummary("gantt", source, diagnosticsForDiagram("gantt", source), [...fixes, ...fixes])).toBe(
    "1 error remains: 1 needs review.",
  );
});

it("reports completion and singular manual errors", () => {
  const source = "@startgantt\n[A] lasts -2 days\n@endgantt";
  expect(remainingRepairSummary("gantt", source, diagnosticsForDiagram("gantt", source), [])).toBe(
    "1 error remains: 1 needs manual editing.",
  );
  expect(remainingRepairSummary("gantt", source, [], [])).toBe("No errors remain.");
});
