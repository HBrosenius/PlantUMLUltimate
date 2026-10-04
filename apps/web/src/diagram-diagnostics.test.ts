import { describe, expect, it } from "vitest";
import type { DiagramKind } from "./model";
import { diagnosticsForDiagram, quickFixesForDiagram } from "./diagram-diagnostics";

describe("shared diagram diagnostics", () => {
  const cases: Array<{ kind: DiagramKind; source: string; fix: boolean }> = [
    { kind: "gantt", source: "@startgantt\n[A] lasts 2\n@endgantt", fix: true },
    { kind: "sequence", source: "@startuml\nalt Ready\n@enduml", fix: true },
    { kind: "usecase", source: "@startuml\npackage System {\nusecase Login\n@enduml", fix: true },
    { kind: "class", source: "@startuml\nclass Order {\n@enduml", fix: true },
    { kind: "activity", source: "@startuml\nwhile (More?)\n:Work;\n@enduml", fix: true },
    { kind: "wbs", source: "*** Orphan", fix: true },
  ];

  for (const item of cases)
    it(`reports ${item.kind} diagnostics and safe fixes`, () => {
      expect(diagnosticsForDiagram(item.kind, item.source).length).toBeGreaterThan(0);
      expect(quickFixesForDiagram(item.kind, item.source).length > 0).toBe(item.fix);
    });

  it("keeps preserved Gantt syntax out of the Problems list", () => {
    expect(diagnosticsForDiagram("gantt", "@startgantt\ncustom preserved command\n@endgantt")).toEqual([]);
  });
});

describe("syntax repairs", () => {
  for (const kind of ["gantt", "wbs", "sequence", "usecase", "class", "component", "activity"] as const) {
    const tag = kind === "gantt" ? "gantt" : kind === "wbs" ? "wbs" : "uml";
    it(`repairs both misspelled tags for ${kind} without changing tag arguments`, () => {
      const source = `@strat${tag} output\n@end${tag.slice(0, -1)}`;
      const fixes = quickFixesForDiagram(kind, source).filter((fix) => fix.label?.startsWith("Use @"));
      expect(fixes).toHaveLength(2);
      expect(fixes.map((fix) => fix.replacement)).toEqual([`@start${tag}`, `@end${tag}`]);
      expect(
        diagnosticsForDiagram(kind, source).filter((item) => item.message.startsWith("Misspelled diagram tag")),
      ).toHaveLength(2);
      let repaired = source;
      for (const fix of [...fixes].reverse())
        repaired = repaired.slice(0, fix.from) + fix.replacement + repaired.slice(fix.to);
      expect(repaired).toBe(`@start${tag} output\n@end${tag}`);
    });
  }

  it.each([
    ["[Architecture lasts 6 days", "[Architecture] lasts 6 days"],
    ["[Frontend] starts at [Backend", "[Frontend] starts at [Backend]"],
    ["[Frontend] starts at [Backend's end", "[Frontend] starts at [Backend]'s end"],
    ["[Frontend starts at [Backend]'s end", "[Frontend] starts at [Backend]'s end"],
    ["[Frontend starts at [Backend's end", "[Frontend] starts at [Backend]'s end"],
  ])("repairs missing brackets in %s", (line, expected) => {
    const source = `@startgantt\n[Backend] lasts 2 days\n${line}\n@endgantt`;
    const fixes = quickFixesForDiagram("gantt", source);
    expect(fixes.some((fix) => fix.replacement === expected)).toBe(true);
  });

  it("ignores tag-like text in comments, notes, quoted labels and unrelated directives", () => {
    const source =
      "@startuml\n' @stratuml\n/'\n@ednuml\n'/\nnote left\n@stratuml\nend note\nclass \"@ednuml\"\n@startjson\n@enduml";
    expect(quickFixesForDiagram("class", source).filter((fix) => fix.label?.startsWith("Use @"))).toEqual([]);
  });

  it("does not guess a bracket position in an ambiguous label", () => {
    expect(
      quickFixesForDiagram("gantt", "@startgantt\n[Unknown label\n@endgantt").filter(
        (fix) => fix.label === "Add missing closing bracket",
      ),
    ).toEqual([]);
  });
});
