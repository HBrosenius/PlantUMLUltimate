import { describe, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import liveAudit from "../../../tests/fixtures/official-plantuml/keyword-audit-summary.json";
import type { DiagramKind } from "./model";
import * as keywordModule from "./diagram-keyword-repairs";
import { keywordRepairs } from "./diagram-keyword-repairs";
import classExamples from "../../../tests/fixtures/official-plantuml/class.json";
import usecaseExamples from "../../../tests/fixtures/official-plantuml/usecase.json";
import componentExamples from "../../../tests/fixtures/official-plantuml/component.json";
import activityExamples from "../../../tests/fixtures/official-plantuml/activity.json";
import ganttExamples from "../../../tests/fixtures/official-plantuml/gantt.json";
import wbsExamples from "../../../tests/fixtures/official-plantuml/wbs.json";
import sequenceExamples from "../../../tests/fixtures/official-plantuml/sequence.json";
import { diagnosticsForDiagram, quickFixesForDiagram } from "./diagram-diagnostics";

const bodies: Record<DiagramKind, string> = {
  sequence: "Alice -> Bob: Hello",
  class: "class Order",
  component: "component Service",
  usecase: "usecase Login",
  activity: "",
  gantt: "[Work] lasts 2 days",
  wbs: "* Root\n** Child",
};
const statements: Array<[DiagramKind, string]> = [
  ...Object.keys(bodies).map(
    (kind) => [kind as DiagramKind, "skinparam backgroundColor white"] as [DiagramKind, string],
  ),
  ["class", "class Customer"],
  ["class", "interface Customer"],
  ["class", "enum Status"],
  ["class", "annotation Marker"],
  ["class", "abstract class Base"],
  ["class", 'package "Domain" {\nclass Customer\n}'],
  ["usecase", "actor Customer"],
  ["usecase", "usecase Checkout"],
  ["usecase", 'rectangle "System" {\nusecase Checkout\n}'],
  ["component", "component Backend"],
  ["component", "interface API"],
  ["component", 'package "Services" {\ncomponent Backend\n}'],
  ["component", 'database "Store"'],
  ["component", 'node "Host"'],
  ["component", 'cloud "Cloud"'],
  ["activity", "start"],
  ["activity", "stop"],
  ["activity", "if (ready?) then (yes)\n:Work;\nendif"],
  ["activity", "while (ready?)\n:Work;\nendwhile"],
  ["activity", "repeat\n:Work;\nrepeat while (ready?)"],
  ["activity", "switch (value)\ncase (one)\n:Work;\nendswitch"],
  ["activity", "fork\n:Work;\nfork again\n:More;\nend fork"],
  ["activity", 'partition "Work" {\n:Work;\n}'],
  ["gantt", "printscale weekly"],
  ["gantt", "Project starts 2026-09-01"],
];

function mutations(word: string): string[] {
  return [
    ...new Set(
      [...word].flatMap((char, index) => [
        word.slice(0, index) + word.slice(index + 1),
        word.slice(0, index) + char + word.slice(index),
        word.slice(0, index) + "z" + word.slice(index + 1),
        ...(index + 1 < word.length ? [word.slice(0, index) + word[index + 1] + char + word.slice(index + 2)] : []),
      ]),
    ),
  ].filter((mutant) => mutant !== word);
}

export function keywordAuditInventory() {
  return statements.flatMap(([kind, statement], example) => {
    const word = statement.match(/^[a-z]+/i)![0];
    const suffix = kind === "gantt" ? "gantt" : kind === "wbs" ? "wbs" : "uml";
    const original = `@start${suffix}\n${statement}\n${bodies[kind]}\n@end${suffix}`;
    return mutations(word).map((mutant) => {
      const source = `@start${suffix}\n${mutant}${statement.slice(word.length)}\n${bodies[kind]}\n@end${suffix}`;
      const repairs = quickFixesForDiagram(kind, source);
      return {
        id: `${kind}-${example}-${mutant}`,
        kind,
        example,
        mutation: `${word} → ${mutant}`,
        original,
        source,
        diagnostics: diagnosticsForDiagram(kind, source),
        repairs: repairs.map((repair) => ({
          mode: "individual",
          message: repair.message,
          source: source.slice(0, repair.from) + repair.replacement + source.slice(repair.to),
        })),
      };
    });
  });
}

describe("cross-diagram keyword mutation audit", () => {
  it("detects keyword typos and restores the original statement", () => {
    const baseline = process.env.PLANTUML_KEYWORD_BASELINE
      ? vi.spyOn(keywordModule, "keywordRepairs").mockReturnValue([])
      : undefined;
    const inventory = keywordAuditInventory();
    baseline?.mockRestore();
    if (process.env.PLANTUML_KEYWORD_EXPORT)
      writeFileSync(process.env.PLANTUML_KEYWORD_EXPORT, JSON.stringify(inventory, null, 2));
    if (process.env.PLANTUML_KEYWORD_BASELINE) return;
    const identity = inventory.map((item) => ({
      id: item.id,
      source: item.source,
      original: item.original,
      repairs: item.repairs.map((repair) => repair.source),
    }));
    expect(createHash("sha256").update(JSON.stringify(identity)).digest("hex")).toBe(liveAudit.inventoryHash);
    expect(liveAudit.results.reduce((total, item) => total + item.equivalentRepairs, 0)).toBe(inventory.length);
    expect(liveAudit.results.every((item) => item.changedRepairs === 0)).toBe(true);
    for (const item of inventory) {
      expect(
        item.diagnostics.some((diagnostic) => diagnostic.severity === "error"),
        item.id,
      ).toBe(true);
      expect(
        item.repairs.some((repair) => repair.source === item.original),
        item.id,
      ).toBe(true);
    }
  });
});

describe("official keyword compatibility", () => {
  for (const [kind, corpus] of [
    ["class", classExamples],
    ["usecase", usecaseExamples],
    ["component", componentExamples],
    ["activity", activityExamples],
    ["gantt", ganttExamples],
    ["wbs", wbsExamples],
    ["sequence", sequenceExamples],
  ] as const) {
    it(`preserves all ${corpus.examples.length} official ${kind} examples`, () => {
      for (const [index, source] of corpus.examples.entries())
        expect(keywordRepairs(kind, source), `${kind} example ${index + 1}`).toEqual([]);
    });
  }
});

describe("keyword repair context", () => {
  it("preserves class members, including multiline declarations and nested containers", () => {
    const source =
      "@startuml\npackage Domain {\nclass Customer {\nclas value\nskinparm field\n}\nclass Second\n{\nclas value\n}\n}\n@enduml";
    expect(keywordRepairs("class", source)).toEqual([]);
  });
  it("repairs declarations inside containers", () => {
    const source = "@startuml\npackage Domain {\nclas Customer\n}\n@enduml";
    expect(keywordRepairs("class", source).map((fix) => fix.replacement)).toEqual(["class"]);
  });
  it.each(["\n", "\r\n"])("preserves quoted labels, actions, comments, and text blocks with %j", (newline) => {
    const source = [
      "@startuml",
      "title",
      "skinparm false",
      "endtitle",
      "' skinparm false",
      "/'",
      "skinparm false",
      "'/",
      "note left",
      "skinparm false",
      "end note",
      "<style>",
      "skinparm false",
      "</style>",
      ":A multiline action",
      "skinparm false;",
      "stop",
      "@enduml",
    ].join(newline);
    expect(keywordRepairs("activity", source)).toEqual([]);
  });
  it("preserves valid relationship endpoints close to keywords", () => {
    expect(keywordRepairs("class", "@startuml\nclas --> Other\ninterfac -- Other\n@enduml")).toEqual([]);
  });
});
