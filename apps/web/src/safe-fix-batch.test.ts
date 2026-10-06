import { expect, it } from "vitest";
import { diagnosticsForDiagram, quickFixesForDiagram } from "./diagram-diagnostics";
import { safeFixBatch } from "./safe-fix-batch";

it("combines independent tag repairs and retains an ambiguous duration", () => {
  const source = "@startgant\n[A] lasts 5\n@endgant";
  const batch = safeFixBatch("gantt", source, quickFixesForDiagram("gantt", source));
  expect(batch.fixes).toHaveLength(2);
  expect(batch.source).toBe("@startgantt\n[A] lasts 5\n@endgantt");
  expect(diagnosticsForDiagram("gantt", batch.source).filter((item) => item.severity === "error")).toHaveLength(1);
});

it("excludes overlapping edits, including point insertions at the same position", () => {
  const source = "@startgant\n[A] lasts 2 days\n@endgant";
  const fixes = quickFixesForDiagram("gantt", source);
  const opening = fixes.find((fix) => fix.from === 0)!;
  const batch = safeFixBatch("gantt", source, [...fixes, { ...opening, replacement: "@startwbs" }]);
  expect(batch.fixes).toHaveLength(1);
  expect(batch.source).toBe(source.replace("@endgant", "@endgantt"));
  expect(
    safeFixBatch("gantt", source, [
      { from: 0, to: 0, replacement: "@startgantt\n", message: "Insert" },
      { from: 0, to: 0, replacement: "@startwbs\n", message: "Other insertion" },
    ]).fixes,
  ).toEqual([]);
});

it("deduplicates identical fixes and rejects edits introducing diagnostics", () => {
  const source = "@startgantt\n[A] lasts 5 days and 50% completed\n@endgantt";
  const fixes = quickFixesForDiagram("gantt", source);
  expect(safeFixBatch("gantt", source, [...fixes, ...fixes]).fixes).toHaveLength(1);
  const fix = fixes[0]!;
  expect(safeFixBatch("gantt", source, [{ ...fix, replacement: "is 150% completed" }]).fixes).toEqual([]);
});

it("excludes alternatives with different insertion positions in a choice group", () => {
  const source = "@startuml\nclass A {\n  +id: UUID\nclass B\n@enduml";
  // Explicit alternatives exercise grouping even when automatic suggestions are withheld.
  const fixes = [source.indexOf("class B"), source.indexOf("@enduml")].map((from) => ({
    from,
    to: from,
    replacement: "}\n",
    message: "Close class member block",
    choiceGroup: "class-close:9",
  }));
  expect(safeFixBatch("class", source, fixes).fixes).toEqual([]);
});

it("withholds otherwise valid corrections that introduce scheduling warnings", () => {
  const source =
    "@startgant\nProject starts 2026-09-21\n[Backend] lasts 2 days\n[Frontend] lasts 2 days\n[Backend] starts at [Frontend]'s end\n[Frontend] starts at [Backned]'s end\n@endgant";
  const batch = safeFixBatch("gantt", source, quickFixesForDiagram("gantt", source));
  expect(batch.fixes.map((fix) => fix.label)).toEqual(["Use @startgantt"]);
  expect(batch.source).toBe(source.replace("@startgant", "@startgantt"));
  expect(diagnosticsForDiagram("gantt", batch.source).some((item) => item.severity === "warning")).toBe(false);
});

it("keeps a warning-producing reference correction separate from independent safe repairs", () => {
  const source =
    "@startgant\nProject starts 2026-09-21\n[Backend] lasts 2 days\n[Frontend] lasts 2 days\n[Frontend] starts at [Backned]'s end\n[Backend] starts at [Frontend]'s end\n[Other] lasts 1 day\n[Other] is 50 completed\n@endgantt";
  const batch = safeFixBatch("gantt", source, quickFixesForDiagram("gantt", source));
  expect(batch.fixes.map((fix) => fix.label)).toEqual(["Use @startgantt", "Add missing %"]);
  expect(batch.source).toBe(source.replace("@startgant", "@startgantt").replace("is 50 completed", "is 50% completed"));
});
