import { describe, expect, it } from "vitest";
import type { DiagramKind } from "./model";
import { diagnosticsForDiagram, quickFixesForDiagram } from "./diagram-diagnostics";

const examples: Array<[DiagramKind, string, string]> = [
  ["gantt", "gantt", "[A] lasts 2 days"],
  ["wbs", "wbs", "* Root\n** Child"],
  ["sequence", "uml", "Alice -> Bob: Hello"],
  ["usecase", "uml", "usecase Login"],
  ["class", "uml", "class Order"],
  ["component", "uml", "component Service"],
  ["activity", "uml", "start\n:Work;\nstop"],
];

function mutations(token: string): string[] {
  return [
    ...new Set(
      [...token].flatMap((char, index) => [
        token.slice(0, index) + token.slice(index + 1),
        token.slice(0, index) + char + token.slice(index),
      ]),
    ),
  ];
}

function expectRepair(kind: DiagramKind, source: string, expected: string) {
  const fixes = quickFixesForDiagram(kind, source);
  expect(diagnosticsForDiagram(kind, source).some((item) => item.severity === "error")).toBe(true);
  expect(fixes.some((fix) => source.slice(0, fix.from) + fix.replacement + source.slice(fix.to) === expected)).toBe(
    true,
  );
  expect(diagnosticsForDiagram(kind, expected).filter((item) => item.severity === "error")).toEqual([]);
}

describe("single character syntax mutations", () => {
  for (const [kind, suffix, body] of examples) {
    const valid = `@start${suffix} output\n${body}\n@end${suffix}`;
    it(`accepts the valid ${kind} fixture without repairs`, () => {
      expect(diagnosticsForDiagram(kind, valid).filter((item) => item.severity === "error")).toEqual([]);
      expect(quickFixesForDiagram(kind, valid)).toEqual([]);
    });
    for (const tag of [`@start${suffix}`, `@end${suffix}`])
      for (const mutated of mutations(tag))
        it(`repairs ${kind} tag ${mutated}`, () => {
          expectRepair(kind, valid.replace(tag, mutated), valid);
        });
  }

  const gantt =
    "@startgantt\nProject starts 2026-09-21\n[Backend] lasts 2 days\n[Frontend] lasts 3 days\n[Frontend] starts at [Backend]'s end\n@endgantt";
  for (const token of ["[Frontend]", "[Backend]'s"])
    for (const index of [0, token.indexOf("]")]) {
      const mutated = token.slice(0, index) + token.slice(index + 1);
      it(`repairs deleted bracket in dependency ${mutated}`, () => {
        const line = "[Frontend] starts at [Backend]'s end";
        expectRepair("gantt", gantt.replace(line, line.replace(token, mutated)), gantt);
      });
    }
});

describe("Gantt keyword mutations", () => {
  const statements = [
    ["Project starts 2026-09-21", "starts"],
    ["[Frontend] lasts 3 days", "lasts"],
    ["[Frontend] is 50% completed", "completed"],
    ["[Frontend] starts at [Backend]'s end", "starts"],
    ["[Frontend] starts at [Backend]'s end", "at"],
    ["sunday are closed", "sunday"],
  ];
  for (const [line, token] of statements)
    for (const mutated of mutations(token!))
      it(`repairs ${line} with ${mutated}`, () => {
        const prefix = "@startgantt\n[Backend] lasts 2 days\n";
        const suffix = "\n@endgantt";
        expectRepair("gantt", prefix + line!.replace(token!, mutated) + suffix, prefix + line + suffix);
      });
});

describe("protected tag-like content", () => {
  for (const [kind, suffix, body] of examples)
    it(`preserves ${kind} comments and notes`, () => {
      const source = `@start${suffix}\n${body}\n' start${suffix}\n/'\n@@end${suffix}\n'/\nnote left\nstart${suffix}\n@@end${suffix}\nend note\n@end${suffix}`;
      expect(
        quickFixesForDiagram(kind, source).filter((fix) => fix.message?.startsWith("Misspelled diagram tag")),
      ).toEqual([]);
    });
});

describe("tag-like text in quoted labels", () => {
  const bodies: Array<[DiagramKind, string, string]> = [
    ["gantt", "gantt", '[A] lasts 2 days\n[A] displays as "startgantt @@endgantt"'],
    ["sequence", "uml", 'participant "startuml @@enduml" as A'],
    ["class", "uml", 'class "startuml @@enduml" as A'],
    ["component", "uml", 'component "startuml @@enduml" as A'],
    ["usecase", "uml", 'usecase "startuml @@enduml" as A'],
  ];
  for (const [kind, suffix, body] of bodies)
    it(`preserves quoted ${kind} labels`, () => {
      const source = `@start${suffix}\n${body}\n@end${suffix}`;
      expect(
        quickFixesForDiagram(kind, source).filter((fix) => fix.message?.startsWith("Misspelled diagram tag")),
      ).toEqual([]);
    });
});
