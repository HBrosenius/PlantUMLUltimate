import { describe, expect, it } from "vitest";
import type { DiagramAdapter } from "@plantuml-studio/language-core";
import { DiagramAdapterRegistry, detectPlantUmlDiagramType } from "./index";

describe("detectPlantUmlDiagramType", () => {
  it.each([
    ["@startgantt\n@endgantt", "gantt"],
    ["@startuml\n@enduml", "uml"],
    ["@startmindmap\n@endmindmap", "mindmap"],
    ["@startwbs\n@endwbs", "wbs"],
    ["@startjson\n@endjson", "json"],
    ["@startyaml\n@endyaml", "yaml"],
    ["@startchronology\n@endchronology", "chronology"],
    ["not a diagram", "unknown"],
  ] as const)("detects %s as %s", (source, expected) => {
    expect(detectPlantUmlDiagramType(source)).toBe(expected);
  });

  it("is case-insensitive and ignores leading whitespace", () => {
    expect(detectPlantUmlDiagramType("  @STARTWBS\n@endwbs")).toBe("wbs");
  });

  it("matches the first directive found anywhere in the source", () => {
    expect(detectPlantUmlDiagramType("some preamble\n@startgantt\n@endgantt")).toBe("gantt");
  });
});

describe("DiagramAdapterRegistry", () => {
  const makeAdapter = (id: string, detect: (source: string) => boolean): DiagramAdapter<unknown> =>
    ({
      id,
      displayName: id,
      capabilities: { visualSelection: false, visualMove: false, visualResize: false, visualDependencies: false },
      detect,
      parse: () => ({ document: {}, diagnostics: [] }),
      completions: () => [],
      diagnostics: () => [],
      interactiveObjects: () => [],
      applyVisualOperation: () => ({ edits: [] }),
    }) as DiagramAdapter<unknown>;

  it("registers and retrieves adapters by id", () => {
    const registry = new DiagramAdapterRegistry();
    const adapter = makeAdapter("wbs", () => true);
    registry.register(adapter);
    expect(registry.get("wbs")).toBe(adapter);
    expect(registry.get("missing")).toBeUndefined();
  });

  it("lists all registered adapters", () => {
    const registry = new DiagramAdapterRegistry();
    const gantt = makeAdapter("gantt", () => false);
    const wbs = makeAdapter("wbs", () => false);
    registry.register(gantt).register(wbs);
    expect(registry.list()).toEqual([gantt, wbs]);
  });

  it("detect returns the first adapter whose detect() matches", () => {
    const registry = new DiagramAdapterRegistry();
    const gantt = makeAdapter("gantt", () => false);
    const wbs = makeAdapter("wbs", () => true);
    registry.register(gantt).register(wbs);
    expect(registry.detect("@startwbs\n@endwbs")).toBe(wbs);
  });

  it("detect returns undefined when no adapter matches", () => {
    const registry = new DiagramAdapterRegistry();
    registry.register(makeAdapter("gantt", () => false));
    expect(registry.detect("nothing")).toBeUndefined();
  });
});
