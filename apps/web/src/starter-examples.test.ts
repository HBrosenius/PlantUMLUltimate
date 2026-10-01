import { describe, expect, it } from "vitest";
import { parseActivity } from "@plantuml-studio/diagram-activity";
import { parseClassDiagram } from "@plantuml-studio/diagram-class";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { parseSequence } from "@plantuml-studio/diagram-sequence";
import { parseUseCase } from "@plantuml-studio/diagram-usecase";
import { parseWbs } from "@plantuml-studio/diagram-wbs";
import { diagnosticsForDiagram } from "./diagram-diagnostics";
import { detectDiagramKind } from "./diagram-kind";
import type { DiagramKind } from "./model";
import { exampleFileName, STARTER_EXAMPLES } from "./starter-examples";

const parserDiagnostics = (kind: DiagramKind, source: string): Array<{ severity: string; message: string }> => {
  if (kind === "gantt") return parseGantt(source).diagnostics;
  // The sequence parser has no diagnostics of its own; the editor diagnostics below cover it.
  if (kind === "sequence")
    return parseSequence(source).messages.length > 0 ? [] : [{ severity: "error", message: "No messages" }];
  if (kind === "usecase") return parseUseCase(source).diagnostics;
  if (kind === "class" || kind === "component") return parseClassDiagram(source).diagnostics;
  if (kind === "activity") return parseActivity(source).diagnostics;
  return parseWbs(source).diagnostics;
};

describe("starter examples", () => {
  it("offers at least one example for every diagram kind with unique ids", () => {
    const kinds: DiagramKind[] = ["wbs", "gantt", "activity", "sequence", "usecase", "class", "component"];
    for (const kind of kinds) expect(STARTER_EXAMPLES.some((example) => example.kind === kind)).toBe(true);
    expect(new Set(STARTER_EXAMPLES.map((example) => example.id)).size).toBe(STARTER_EXAMPLES.length);
  });

  it.each(STARTER_EXAMPLES.map((example) => [example.id, example] as const))(
    "%s is detected as its kind and parses without errors",
    (_id, example) => {
      expect(detectDiagramKind(example.source)).toBe(example.kind);
      const parseErrors = parserDiagnostics(example.kind, example.source).filter((item) => item.severity === "error");
      expect(parseErrors.map((item) => item.message)).toEqual([]);
      const editorErrors = diagnosticsForDiagram(example.kind, example.source).filter(
        (item) => item.severity === "error",
      );
      expect(editorErrors.map((item) => item.message)).toEqual([]);
    },
  );

  it("schedules Gantt examples in late 2026 with closed weekends", () => {
    for (const example of STARTER_EXAMPLES.filter((item) => item.kind === "gantt")) {
      expect(example.source).toMatch(/Project starts 2026-(?:09|1[0-2])-\d\d/);
      expect(example.source).toContain("saturday are closed");
      expect(example.source).toContain("sunday are closed");
      const { document } = parseGantt(example.source);
      expect(document.tasks.length).toBeGreaterThan(0);
    }
  });

  it("derives file names from example titles", () => {
    expect(exampleFileName({ title: "Product launch plan" })).toBe("product-launch-plan.pumlu");
    expect(exampleFileName({ title: "Login with OAuth" })).toBe("login-with-oauth.pumlu");
    expect(exampleFileName({ title: "!!!" })).toBe("example.pumlu");
  });
});
