import { beforeEach, expect, it, vi } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { analyzeDiagram, createDiagramAnalyzer } from "./diagram-diagnostics";

vi.mock("@plantuml-studio/diagram-gantt", async (importOriginal) => {
  const original = await importOriginal<typeof import("@plantuml-studio/diagram-gantt")>();
  return { ...original, parseGantt: vi.fn(original.parseGantt) };
});
beforeEach(() => {
  vi.mocked(parseGantt).mockClear();
});

it("shares one Gantt parse across diagnostics and fixes for a large valid snapshot", () => {
  const source = `@startgantt\nProject starts 2026-09-01\n${Array.from({ length: 300 }, (_, i) => `[Task ${i}] starts 2026-09-01 and lasts 2 days`).join("\n")}\n@endgantt`;
  const analysis = analyzeDiagram("gantt", source);
  expect(parseGantt).not.toHaveBeenCalled();
  expect(analysis.diagnostics).toEqual([]);
  expect(analysis.quickFixes).toEqual([]);
  const diagnostics = analysis.diagnostics;
  expect(analysis.diagnostics).toBe(diagnostics);
  expect(parseGantt).toHaveBeenCalledTimes(1);
});

it("reuses the app model without reparsing it", () => {
  const source = "@startgantt\n[A] lasts 2 days\n@endgantt";
  const parsed = parseGantt(source);
  vi.mocked(parseGantt).mockClear();
  const analysis = analyzeDiagram("gantt", source, parsed);
  expect(analysis.quickFixes).toEqual([]);
  expect(analysis.diagnostics).toEqual([]);
  expect(parseGantt).not.toHaveBeenCalled();
});

it("keeps repair ranges and diagnostics specific to each edited source", () => {
  const broken = analyzeDiagram("gantt", "@startgantt\n[A] lasts 2\n@endgantt");
  expect(broken.quickFixes.length).toBeGreaterThan(0);
  expect(broken.diagnostics.length).toBeGreaterThan(0);
  const corrected = analyzeDiagram("gantt", "@startgantt\n[A] lasts 2 days\n@endgantt");
  expect(corrected.diagnostics).toEqual([]);
  expect(corrected.quickFixes).toEqual([]);
  expect(broken.diagnostics.length).toBeGreaterThan(0);
});

it("shares the editor's exact snapshot with its owner and evicts the previous source", () => {
  const analyze = createDiagramAnalyzer();
  const source = "@startgantt\n[A] lasts 2 days\n@endgantt";
  const editor = analyze("gantt", source);
  expect(editor.quickFixes).toEqual([]);
  expect(analyze("gantt", source)).toBe(editor);
  expect(analyze("gantt", source).diagnostics).toEqual([]);
  expect(parseGantt).toHaveBeenCalledTimes(1);
  const next = analyze("gantt", source.replace("2 days", "3 days"));
  expect(next).not.toBe(editor);
  expect(analyze("gantt", source)).not.toBe(editor);
});

it("does not reuse results across diagram kinds even when their source matches", () => {
  const analyze = createDiagramAnalyzer();
  const source = "@startuml\nclass Example {\n@enduml";
  const classes = analyze("class", source);
  const components = analyze("component", source);
  expect(components).not.toBe(classes);
  expect(components.kind).toBe("component");
});

it("reuses the owner's Gantt parse when the editor analyzes the same source without one", () => {
  const source = "@startgantt\n[A] lasts 2 days\n@endgantt";
  const known = parseGantt(source);
  vi.mocked(parseGantt).mockClear();
  const analyze = createDiagramAnalyzer((candidate) => (candidate === source ? known : undefined));
  expect(analyze("gantt", source).diagnostics).toEqual([]);
  expect(parseGantt).not.toHaveBeenCalled();
  void analyze("gantt", source.replace("2 days", "3 days")).diagnostics;
  expect(parseGantt).toHaveBeenCalledTimes(1);
});
