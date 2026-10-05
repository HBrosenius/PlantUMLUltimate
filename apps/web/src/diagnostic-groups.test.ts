import { afterEach, describe, expect, it, vi } from "vitest";
import type { Diagnostic } from "@codemirror/lint";
import { diagnosticsForDiagram } from "./diagram-diagnostics";
import { groupDiagnostics } from "./diagnostic-groups";

vi.mock("./diagram-diagnostics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./diagram-diagnostics")>();
  return { ...actual, diagnosticsForDiagram: vi.fn(actual.diagnosticsForDiagram) };
});
afterEach(() => vi.mocked(diagnosticsForDiagram).mockClear());

const root: Diagnostic = { from: 0, to: 10, severity: "error", message: "Misspelled start tag" };
const dependent: Diagnostic = { from: 11, to: 16, severity: "error", message: "Statement outside diagram" };
const independent: Diagnostic = { from: 17, to: 22, severity: "error", message: "Invalid duration" };
const source = "@startgant\nBuild\nOther";
const fix = { from: 0, to: 10, replacement: "@startgantt", message: "Correct start tag" };

describe("diagnostic grouping", () => {
  it("groups proven follow-on errors, retaining shifted independent diagnostics exactly once", () => {
    vi.mocked(diagnosticsForDiagram).mockReturnValueOnce([{ ...independent, from: 18, to: 23 }]);
    const groups = groupDiagnostics("gantt", source, [dependent, independent, root], [fix, fix]);
    expect(groups).toEqual([
      { root, related: [dependent] },
      { root: independent, related: [] },
    ]);
  });
  it("does not group repairs that introduce new errors", () => {
    vi.mocked(diagnosticsForDiagram).mockReturnValueOnce([{ ...dependent, message: "New error" }]);
    expect(groupDiagnostics("gantt", source, [root, dependent], [fix])).toEqual([
      { root, related: [] },
      { root: dependent, related: [] },
    ]);
  });
  it("keeps independent parser errors separate without a proven connection", () => {
    const text = "@startgantt\n[One] lasts -2 days\n[Two] lasts -3 days\n@endgantt";
    const diagnostics = diagnosticsForDiagram("gantt", text);
    expect(diagnostics.length).toBeGreaterThan(1);
    expect(groupDiagnostics("gantt", text, diagnostics, []).map((group) => group.root)).toEqual(diagnostics);
  });
  it("does not infer a local root from a whole-document replacement", () => {
    expect(groupDiagnostics("gantt", source, [root, dependent], [{ ...fix, to: source.length }])).toEqual([
      { root, related: [] },
      { root: dependent, related: [] },
    ]);
  });
  it("rechecks the current diagnostics after the repair", () => {
    expect(groupDiagnostics("gantt", "@startgantt\n[Build] lasts 2 days\n@endgantt", [], [])).toEqual([]);
  });
});
