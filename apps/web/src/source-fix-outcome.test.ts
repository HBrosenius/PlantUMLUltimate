import { describe, expect, it } from "vitest";
import type { Diagnostic } from "@codemirror/lint";
import { diagnosticsForDiagram, quickFixesForDiagram, type DiagramQuickFix } from "./diagram-diagnostics";
import { sourceFixOutcome } from "./source-fix-outcome";

const error = (from: number, to: number, message = "Invalid statement"): Diagnostic => ({ from, to, message, severity: "error" });
const fix: DiagramQuickFix = { from: 0, to: 3, replacement: "valid", message: "Repair statement" };

describe("sourceFixOutcome", () => {
  it("preserves a point error at EOF when text is inserted there", () => {
    const insertion = { ...fix, from: 3, to: 3, replacement: "\n" };
    const outcome = sourceFixOutcome("bad", insertion, [error(3, 3, "Missing end tag")], [error(4, 4, "Missing end tag")]);
    expect(outcome.resolved).toHaveLength(0);
    expect(outcome.introduced).toHaveLength(0);
    expect(outcome.message).toBe("No diagnostic changes detected. 1 error remains.");
  });

  it("keeps a ranged error ending at an insertion point attached to its original text", () => {
    const insertion = { ...fix, from: 3, to: 3, replacement: "\n" };
    const outcome = sourceFixOutcome("bad", insertion, [error(0, 3)], [error(0, 3)]);
    expect(outcome.resolved).toHaveLength(0);
    expect(outcome.introduced).toHaveLength(0);
  });

  it("shifts point errors after an edit and preserves those before it", () => {
    const outcome = sourceFixOutcome("bad", { ...fix, from: 1, to: 2, replacement: "long" }, [error(0, 0), error(3, 3)], [error(0, 0), error(6, 6)]);
    expect(outcome.resolved).toHaveLength(0);
    expect(outcome.introduced).toHaveLength(0);
  });

  it("does not report a missing end tag as new after inserting a trailing newline", () => {
    const source = "@startuml\nclass Order";
    const insertion = { ...fix, from: source.length, to: source.length, replacement: "\n" };
    const before = diagnosticsForDiagram("class", source);
    expect(before.some((item) => item.from === source.length && item.to === source.length)).toBe(true);
    const outcome = sourceFixOutcome(source, insertion, before, diagnosticsForDiagram("class", source + "\n"));
    expect(outcome.resolved).toHaveLength(0);
    expect(outcome.introduced).toHaveLength(0);
    expect(outcome.needsReview).toBe(false);
  });

  it("matches repeated errors after their positions shift", () => {
    const outcome = sourceFixOutcome("bad\nbad", fix, [error(0, 3), error(4, 7)], [error(6, 9)]);
    expect(outcome.resolved).toHaveLength(1);
    expect(outcome.introduced).toHaveLength(0);
    expect(outcome.message).toBe("Resolves 1 error. 1 error remains.");
  });

  it("flags a new error even when the total error count stays the same", () => {
    const outcome = sourceFixOutcome("bad", fix, [error(0, 3, "Missing keyword")], [error(0, 5, "Unknown task")]);
    expect(outcome.resolved).toHaveLength(1);
    expect(outcome.introduced).toHaveLength(1);
    expect(outcome.needsReview).toBe(true);
    expect(outcome.message).toContain("Introduces 1 new error");
  });

  it("does not treat an identical message at another location as the old error", () => {
    const outcome = sourceFixOutcome("bad\nvalid", fix, [error(0, 3)], [error(6, 11)]);
    expect(outcome.resolved).toHaveLength(1);
    expect(outcome.introduced).toHaveLength(1);
  });

  it("matches each diagnostic only once", () => {
    const outcome = sourceFixOutcome("bad", fix, [error(0, 3)], [error(0, 5), error(0, 5)]);
    expect(outcome.resolved).toHaveLength(0);
    expect(outcome.introduced).toHaveLength(1);
  });

  it("preserves unchanged diagnostics moved by a whole-document repair", () => {
    const outcome = sourceFixOutcome("bad\nok", { ...fix, to: 6, replacement: "ok\nbad" }, [error(0, 3)], [error(3, 6)]);
    expect(outcome.resolved).toHaveLength(0);
    expect(outcome.introduced).toHaveLength(0);
    expect(outcome.message).toContain("No diagnostic changes detected");
  });

  it("keeps warnings separate from remaining errors", () => {
    const warning: Diagnostic = { from: 0, to: 3, message: "Check this", severity: "warning" };
    const outcome = sourceFixOutcome("bad", fix, [error(0, 3)], [{ ...warning, to: 5 }]);
    expect(outcome.remainingErrors).toBe(0);
    expect(outcome.needsReview).toBe(true);
    expect(outcome.message).toContain("Introduces 1 new warning");
    expect(outcome.message).toContain("No errors remain");
  });

  it("predicts a real Gantt completion repair without changing the source", () => {
    const source = "@startgantt\n[Build] lasts 2 days\n[Build] is 50 completed\n@endgantt";
    const repair = quickFixesForDiagram("gantt", source).find((item) => item.label === "Add missing %")!;
    const candidate = source.slice(0, repair.from) + repair.replacement + source.slice(repair.to);
    const outcome = sourceFixOutcome(source, repair, diagnosticsForDiagram("gantt", source), diagnosticsForDiagram("gantt", candidate));
    expect(outcome.message).toBe("Resolves 1 error. No errors remain.");
  });

  it("detects a dependency cycle exposed by repairing an unknown task", () => {
    const source = "@startgantt\nProject starts 2026-09-21\n[Backend] lasts 2 days\n[Frontend] lasts 2 days\n[Backend] starts at [Frontend]'s end\n[Frontend] starts at [Backned]'s end\n@endgantt";
    const repair = quickFixesForDiagram("gantt", source).find((item) => item.label === "Use task Backend")!;
    const candidate = source.slice(0, repair.from) + repair.replacement + source.slice(repair.to);
    const outcome = sourceFixOutcome(source, repair, diagnosticsForDiagram("gantt", source), diagnosticsForDiagram("gantt", candidate));
    expect(outcome.needsReview).toBe(true);
    expect(outcome.introduced.some((item) => item.message.includes("Dependency cycle"))).toBe(true);
  });
});
