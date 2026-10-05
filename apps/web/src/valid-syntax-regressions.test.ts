import { describe, expect, it } from "vitest";
import type { DiagramKind } from "./model";
import { diagnosticsForDiagram, quickFixesForDiagram } from "./diagram-diagnostics";
import { validateGeneratedSource } from "./generated-source-validation";
import { insertClassEntity } from "@plantuml-studio/diagram-class";
import { insertUseCaseElement } from "@plantuml-studio/diagram-usecase";
import { insertActivityStructure, parseActivity } from "@plantuml-studio/diagram-activity";

const suffixFor = (kind: DiagramKind) => (kind === "gantt" ? "gantt" : kind === "wbs" ? "wbs" : "uml");
function sourceFor(kind: DiagramKind, body: string, newline: string) {
  const suffix = suffixFor(kind);
  return `@start${suffix} output\n' Regression fixture\n${body}\n@end${suffix}`.replaceAll("\n", newline);
}
function expectValid(kind: DiagramKind, source: string) {
  expect(diagnosticsForDiagram(kind, source).filter((item) => item.severity === "error")).toEqual([]);
  expect(quickFixesForDiagram(kind, source)).toEqual([]);
}

const fixtures: Array<[DiagramKind, string, string]> = [
  [
    "gantt",
    "aliases, colors and completion",
    "[Build] as [B] lasts 2 days\n[B] is colored in LightBlue\n[B] is 50% completed",
  ],
  ["gantt", "standalone comments", "' Duration\n[Build] lasts 2 days\n' Color\n[Build] is colored in LightBlue"],
  ["gantt", "note text", "[Build] lasts 2 days\nnote bottom\nExample: endif {{ @enduml\nend note"],
  ["wbs", "colors and aliases", "* Project\n**[#LightBlue] Build <<build>>"],
  ["wbs", "free text", '* Project\n** Label with "quotes", {braces} and endif'],
  [
    "sequence",
    "participant decorations",
    'participant "Client [end]" as C <<service>> #LightBlue\nparticipant Server as S\nC -> S: Hello',
  ],
  ["sequence", "inline note", "participant Client as C\nnote right of C: endif end note"],
  [
    "sequence",
    "nested fragments and comments",
    "alt Ready\nloop Retry\nAlice -> Bob: Hello\nend ' Loop\nend ' Alternative",
  ],
  ["sequence", "note command examples", "Alice -> Bob: Hello\nnote over Alice\ngroup Example\nalt Example\nend note"],
  [
    "class",
    "decorations and members",
    'class "Order [end]" as O <<entity>> #LightBlue {\n  +id: UUID\n  {static} +save()\n}',
  ],
  ["class", "trailing declaration comment", 'class "Order" as O #LightBlue \' Example'],
  ["class", "nested groups", 'package "Outer" {\n  package "Inner" {\n    class A\n  }\n}'],
  ["component", "decorations", 'component "API [end]" as A <<service>> #LightBlue'],
  ["component", "nested groups", 'package "Services" {\n  component API\n}'],
  ["usecase", "decorations", 'usecase "Login [end]" as L <<primary>> #LightBlue'],
  [
    "usecase",
    "inline floating note",
    'usecase Login as L\nnote "Confirm the release owner" as ReleaseRisk\nnote right of L: Maintains access',
  ],
  ["usecase", "nested groups", 'rectangle "System" {\n  package "Authentication" {\n    usecase Login\n  }\n}'],
  ["activity", "exit labels", "start\nwhile (More?) is (yes)\n:Work;\nendwhile (no)\nstop"],
  [
    "activity",
    "nested controls",
    "start\nif (Ready?) then (yes)\n  while (More?) is (yes)\n    :Work;\n  endwhile (no)\nelse (no)\n  :Wait;\nendif\nstop",
  ],
  ["activity", "colors and stereotypes", "start\n:Archive; <<service>> <<#PaleGreen>>\nstop"],
];

describe("valid syntax combinations", () => {
  for (const [kind, name, body] of fixtures)
    for (const newline of ["\n", "\r\n"])
      it(`accepts ${kind} ${name} with ${newline === "\n" ? "LF" : "CRLF"}`, () => {
        const source = sourceFor(kind, body, newline);
        expectValid(kind, source);
        const insertion =
          kind === "gantt"
            ? "[Added] lasts 1 day"
            : kind === "wbs"
              ? "** Added"
              : kind === "sequence"
                ? "Alice -> Bob: Added"
                : kind === "activity"
                  ? ":Added;"
                  : kind === "usecase"
                    ? "usecase Added"
                    : "class Added";
        const after = source.replace(`@end${suffixFor(kind)}`, insertion + newline + `@end${suffixFor(kind)}`);
        expectValid(kind, after);
        expect(validateGeneratedSource(kind, source, after)).toMatchObject({ valid: true, introduced: [] });
      });
});

describe("generated visual operation combinations", () => {
  for (const kind of ["class", "component", "usecase"] as const)
    for (const alias of [undefined, "Added"])
      for (const color of [undefined, "LightBlue"])
        for (const stereotype of [undefined, "service"])
          it(`accepts generated ${kind} alias=${alias} color=${color} stereotype=${stereotype}`, () => {
            const before = sourceFor(kind, kind === "usecase" ? "usecase Existing" : "class Existing", "\n");
            const options = {
              label: "Added [end] {label}",
              ...(alias ? { alias } : {}),
              ...(color ? { color } : {}),
              ...(stereotype ? { stereotype } : {}),
            };
            const after =
              kind === "usecase"
                ? insertUseCaseElement(before, { ...options, kind: "usecase" })
                : insertClassEntity(before, {
                    ...options,
                    kind: kind === "component" ? "component" : "class",
                    members: [],
                  });
            expect(after).toContain("Added [end] {label}");
            expectValid(kind, after);
            expect(validateGeneratedSource(kind, before, after)).toMatchObject({ valid: true, introduced: [] });
          });

  for (const kind of ["if", "while", "repeat", "fork", "split", "switch"] as const)
    it(`accepts generated Activity ${kind} structure`, () => {
      const before = sourceFor("activity", "start\nstop", "\n");
      const after = insertActivityStructure(before, parseActivity(before), {
        kind,
        condition: "Ready?",
        actionLabel: "Work",
      });
      expect(after).toContain(":Work;");
      expectValid("activity", after);
      expect(validateGeneratedSource("activity", before, after)).toMatchObject({ valid: true, introduced: [] });
    });
});

function expectExactRepair(kind: DiagramKind, faulty: string, valid: string) {
  expectValid(kind, valid);
  expect(diagnosticsForDiagram(kind, faulty).some((item) => item.severity === "error")).toBe(true);
  const fix = quickFixesForDiagram(kind, faulty).find(
    (item) => faulty.slice(0, item.from) + item.replacement + faulty.slice(item.to) === valid,
  );
  expect(fix, "A repair must restore the complete decorated source exactly").toBeDefined();
}

describe("mutations preserve valid syntax combinations", () => {
  for (const [kind, name, body] of fixtures)
    for (const newline of ["\n", "\r\n"])
      for (const opening of [true, false])
        it(`repairs ${kind} ${name} ${opening ? "opening" : "closing"} tag with ${newline === "\n" ? "LF" : "CRLF"}`, () => {
          const valid = sourceFor(kind, body, newline);
          const suffix = suffixFor(kind);
          const token = opening ? `@start${suffix}` : `@end${suffix}`;
          const typo = opening ? `@strat${suffix}` : `@end${suffix.slice(0, -1)}`;
          expectExactRepair(kind, valid.replace(token, typo), valid);
        });

  for (const kind of ["sequence", "class", "component", "usecase"] as const)
    for (const newline of ["\n", "\r\n"])
      for (const mutation of ["opening quote", "closing quote", "duplicated quote"])
        it(`repairs ${kind} decorated ${mutation} with ${newline === "\n" ? "LF" : "CRLF"}`, () => {
          const declaration = kind === "sequence" ? "participant" : kind;
          const line = `${declaration} "Label [end] {literal}" as A <<service>> #LightBlue ' Keep comment`;
          const valid = sourceFor(kind, line, newline);
          const faulty =
            mutation === "opening quote"
              ? valid.replace('"Label', "Label")
              : mutation === "closing quote"
                ? valid.replace('literal}"', "literal}")
                : valid.replace('"Label', '""Label');
          expectExactRepair(kind, faulty, valid);
        });

  for (const [kind, body, token, typo] of [
    [
      "class",
      'package "Outer" {\n  class "Order" as O <<entity>> #LightBlue {\n    +id: UUID\n  }\n}',
      "#LightBlue {",
      "#LightBlue {{",
    ],
    [
      "component",
      'package "Services" {\n  component "API" as A <<service>> #LightBlue\n}',
      'Services" {',
      'Services" {{',
    ],
    ["usecase", 'rectangle "System" {\n  usecase "Login" as L <<primary>> #LightBlue\n}', 'System" {', 'System" {{'],
    [
      "activity",
      "start\nif (Ready?) then (yes)\n  while (More?) is (yes)\n    :Work;\n  endwhile (no)\n  ' Keep comment\nendif\nstop",
      "endwhile",
      "endwhil",
    ],
    [
      "sequence",
      "alt Ready\nloop Retry\nAlice -> Bob: Hello\nend ' Keep loop comment\nend ' Keep alternative comment",
      "end ' Keep loop",
      "endd ' Keep loop",
    ],
    [
      "usecase",
      "usecase Login as L\nnote right of L\nText with [brackets] and {braces}\nend note",
      "end note",
      "end not",
    ],
  ] as const)
    for (const newline of ["\n", "\r\n"])
      it(`repairs decorated nested ${kind} ${typo} with ${newline === "\n" ? "LF" : "CRLF"}`, () => {
        const valid = sourceFor(kind, body, newline);
        expectExactRepair(kind, valid.replace(token, typo), valid);
      });
});
