import { expect, it } from "vitest";
import type { Diagnostic } from "@codemirror/lint";
import { nextRepairDiagnostic } from "./next-repair-diagnostic";
const error = (from: number): Diagnostic => ({ from, to: from + 1, severity: "error", message: "Invalid statement" });
it("continues in source order and wraps after the last error", () => {
  const first = error(2),
    next = error(10),
    last = error(20);
  expect(nextRepairDiagnostic([last, first, next], 5)).toBe(next);
  expect(nextRepairDiagnostic([last, first, next], 21)).toBe(first);
});
it("keeps an unresolved error at the repaired location selected", () => {
  const current = error(5);
  expect(nextRepairDiagnostic([error(10), current], 5)).toBe(current);
});
it("prioritizes errors and then warnings, without promoting informational messages", () => {
  const warning: Diagnostic = { ...error(0), severity: "warning" };
  const remaining = error(10);
  expect(nextRepairDiagnostic([warning, remaining], 0)).toBe(remaining);
  expect(nextRepairDiagnostic([warning], 20)).toBe(warning);
  expect(nextRepairDiagnostic([{ ...warning, severity: "info" }], 0)).toBeUndefined();
  expect(nextRepairDiagnostic([], 0)).toBeUndefined();
});
