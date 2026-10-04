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

describe("opening and stray task bracket repairs", () => {
  it.each([
    ["Frontend] lasts 3 days", "[Frontend] lasts 3 days"],
    ["then Frontend] lasts 3 days", "then [Frontend] lasts 3 days"],
    ["[Frontend] starts at Backend]'s end", "[Frontend] starts at [Backend]'s end"],
    ["[Frontend]] lasts 3 days", "[Frontend] lasts 3 days"],
    ["[Frontend] starts at [Backend]]'s end", "[Frontend] starts at [Backend]'s end"],
    ["]", ""],
  ])("flags and repairs %s", (line, expected) => {
    const source = `@startgantt\n[Backend] lasts 1 day\n${line}\n@endgantt`;
    const fix = quickFixesForDiagram("gantt", source).find((item) => item.replacement === expected);
    expect(fix).toBeDefined();
    expect(diagnosticsForDiagram("gantt", source).some((item) => item.message === "Task brackets are unbalanced")).toBe(
      true,
    );
  });

  it("preserves brackets in quoted display labels and notes", () => {
    const source =
      '@startgantt\n[A] lasts 1 day\n[A] displays as "Result ]"\nnote bottom\nFrontend] lasts 3 days\nend note\n@endgantt';
    expect(
      quickFixesForDiagram("gantt", source).filter((item) => item.message === "Task brackets are unbalanced"),
    ).toEqual([]);
  });
});

it("repairs missing opening brackets on further declarations of an existing task", () => {
  for (const line of [
    "Architecture] starts 2026-09-24",
    "Architecture] is 50% completed",
    "Architecture] lasts 6 days",
  ]) {
    const source = `@startgantt\n[Architecture] lasts 6 days\n${line}\n@endgantt`;
    expect(quickFixesForDiagram("gantt", source).some((fix) => fix.replacement === `[${line}`)).toBe(true);
    expect(diagnosticsForDiagram("gantt", source).some((item) => item.message === "Task brackets are unbalanced")).toBe(
      true,
    );
  }
});

describe("dependency possessive repairs", () => {
  it.each([
    ["[Frontend] starts at [Backend] end", "[Frontend] starts at [Backend]'s end"],
    ["[Frontend] ends at [Backend]s end", "[Frontend] ends at [Backend]'s end"],
    ["[Frontend] starts 5 days after [Backend] end", "[Frontend] starts 5 days after [Backend]'s end"],
    ["[Frontend] starts 3 days before [Backend] start", "[Frontend] starts 3 days before [Backend]'s start"],
    ["[Frontend] starts at [Backend]‘s start", "[Frontend] starts at [Backend]'s start"],
    ["[Frontend] starts at [Backend]' end", "[Frontend] starts at [Backend]'s end"],
    [
      "[Frontend] starts 5 days after [Backend] end and lasts 2 days and is 50% completed",
      "[Frontend] starts 5 days after [Backend]'s end and lasts 2 days and is 50% completed",
    ],
    ["[Release] happens at [Backend] end", "[Release] happens at [Backend]'s end"],
  ])("repairs %s without changing the relationship", (line, expected) => {
    const source = `@startgantt\n[Backend] lasts 8 days\n${line}\n@endgantt`;
    const fix = quickFixesForDiagram("gantt", source).find((item) => item.replacement === expected);
    expect(fix).toBeDefined();
    expect(diagnosticsForDiagram("gantt", source).some((item) => item.actions?.length)).toBe(true);
  });

  it("accepts a supported curly apostrophe without reporting a false error", () => {
    const source = "@startgantt\n[Backend] lasts 8 days\n[Frontend] starts at [Backend]’s end\n@endgantt";
    expect(diagnosticsForDiagram("gantt", source).filter((item) => item.severity === "error")).toEqual([]);
    expect(quickFixesForDiagram("gantt", source)).toEqual([]);
  });

  it("leaves valid dependencies and quoted text unchanged", () => {
    const source =
      '@startgantt\n[Backend] lasts 8 days\n[Frontend] starts at [Backend]\'s end\n[Frontend] displays as "at [Backend] end"\n@endgantt';
    expect(
      quickFixesForDiagram("gantt", source).filter(
        (fix) => fix.message === "Dependency anchor requires the possessive marker 's",
      ),
    ).toEqual([]);
  });
});
