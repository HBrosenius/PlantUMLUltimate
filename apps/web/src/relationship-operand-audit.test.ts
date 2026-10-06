import { describe, expect, it } from "vitest";
import { writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import observations from "../../../tests/fixtures/official-plantuml/operand-renderer-audit.json";
import { statementIssues } from "./diagram-statement-issues";
import type { DiagramKind } from "./model";
import { diagnosticsForDiagram, quickFixesForDiagram } from "./diagram-diagnostics";

type Case = { kind: DiagramKind; statement: string; original: string; prefix?: string; valid?: boolean };
const cases: Case[] = [];
for (const kind of ["class", "component", "usecase", "sequence"] as const) {
  const prefix =
    kind === "sequence"
      ? "participant A\nparticipant B"
      : kind === "class"
        ? "class A\nclass B"
        : kind === "component"
          ? "component A\ncomponent B"
          : "actor A\nusecase B";
  const label = kind === "sequence" ? ": Message" : "";
  const arrow = kind === "sequence" ? "->" : "-->";
  const original = `A ${arrow} B${label}`;
  for (const statement of [`A ${arrow}${label}`, `${arrow} B${label}`, `A > B${label}`, `A < B${label}`, `A B${label}`])
    cases.push({
      kind,
      prefix,
      original: statement.includes(" > ") ? `A -> B${label}` : statement.includes(" < ") ? `A <- B${label}` : original,
      statement,
      valid: kind === "sequence" && (statement === `A ${arrow}${label}` || statement === `${arrow} B${label}`),
    });
  for (const validArrow of kind === "sequence"
    ? ["->", "-->", "<-", "<--", "<->", "->>", "-\\", "-/", "->x", "o->", "-[#red]>"]
    : ["--", "-->", "<--", "..>", "<|--", "--*", "--o", "-[#red]->", "--[hidden]>", "-"])
    cases.push({
      kind,
      prefix,
      original: `A ${validArrow} B${label}`,
      statement: `A ${validArrow} B${label}`,
      valid: true,
    });
}
for (const [kind, original, statements, prefix] of [
  [
    "gantt",
    "[B] starts at [A]'s end",
    ["[B] starts at", "[B] starts at [A]'s", "[B] starts", "[B] lasts", "[B] is colored in", "Project starts"],
    "[A] lasts 2 days\n[B] lasts 2 days",
  ],
  [
    "activity",
    "if (ready?) then (yes)\n:Work;\nendif",
    [
      "if then (yes)\n:Work;\nendif",
      "if\n:Work;\nendif",
      "while\n:Work;\nendwhile",
      "switch\ncase (one)\n:Work;\nendswitch",
    ],
    "start",
  ],
] as const)
  for (const statement of statements) cases.push({ kind, original, statement, prefix });
for (const kind of ["class", "component", "usecase", "sequence", "activity", "gantt", "wbs"] as const) {
  const prefix =
    kind === "wbs"
      ? "* Root"
      : kind === "activity"
        ? "start\n:Work;\nstop"
        : kind === "gantt"
          ? "[A] lasts 2 days"
          : kind === "sequence"
            ? "A -> B: Init"
            : kind === "class"
              ? "class A"
              : kind === "component"
                ? "component A"
                : "usecase A";
  cases.push({ kind, prefix, original: "skinparam backgroundColor white", statement: "skinparam" });
}
for (const [kind, original, statement] of [
  ["class", "class Customer", "class"],
  ["component", "component Service", "component"],
  ["usecase", "actor Customer", "actor"],
  ["sequence", "participant Bob", "participant"],
] as const)
  cases.push({ kind, original, statement });

export function operandAuditInventory() {
  return cases.map((item, example) => {
    const suffix = item.kind === "gantt" ? "gantt" : item.kind === "wbs" ? "wbs" : "uml";
    const wrap = (statement: string) =>
      `@start${suffix}\n${item.prefix ? item.prefix + "\n" : ""}${statement}\n@end${suffix}`;
    const source = wrap(item.statement),
      original = wrap(item.original);
    const repairs = quickFixesForDiagram(item.kind, source);
    return {
      id: `${item.kind}-${example}`,
      kind: item.kind,
      example,
      mutation: item.valid ? "valid-control" : item.statement,
      valid: Boolean(item.valid),
      source,
      original,
      diagnostics: diagnosticsForDiagram(item.kind, source),
      repairs: repairs.map((repair) => ({
        mode: "individual",
        message: repair.message,
        source: source.slice(0, repair.from) + repair.replacement + source.slice(repair.to),
      })),
    };
  });
}

describe("relationship and operand audit", () => {
  it("exports the complete renderer inventory", () => {
    const inventory = operandAuditInventory();
    expect(inventory.length).toBe(82);
    for (const item of inventory) {
      if (item.valid) {
        expect(item.diagnostics, item.id).toEqual([]);
        expect(item.repairs, item.id).toEqual([]);
      } else expect(item.diagnostics.length, item.id).toBeGreaterThan(0);
    }
    if (process.env.PLANTUML_OPERAND_EXPORT)
      writeFileSync(process.env.PLANTUML_OPERAND_EXPORT, JSON.stringify(inventory, null, 2));
  });
});

describe("statement operand safeguards", () => {
  it("preserves all 428 official examples", () => {
    let count = 0;
    for (const kind of ["class", "component", "usecase", "sequence", "activity", "gantt", "wbs"] as const) {
      const corpus = JSON.parse(readFileSync(`tests/fixtures/official-plantuml/${kind}.json`, "utf8")) as {
        examples: string[];
      };
      for (const [index, source] of corpus.examples.entries()) {
        expect(statementIssues(kind, source), `${kind} example ${index + 1}`).toEqual([]);
        count++;
      }
    }
    expect(count).toBe(428);
  });
  it("does not invent missing names, endpoints, conditions or colors", () => {
    for (const [kind, statement] of [
      ["class", "class"],
      ["class", "A -->"],
      ["activity", "if\n:Work;\nendif"],
      ["gantt", "[A] is colored in"],
      ["sequence", "skinparam"],
    ] as const) {
      const source = `@startuml\n${statement}\n@enduml`;
      expect(quickFixesForDiagram(kind, source), statement).toEqual([]);
      expect(
        diagnosticsForDiagram(kind, source).some((item) => item.from === 10),
        statement,
      ).toBe(true);
    }
  });
  it("keeps ambiguous dependency anchors as an explicit choice", () => {
    const fixes = quickFixesForDiagram("gantt", "@startgantt\n[A] lasts 2 days\n[B] starts at [A]'s\n@endgantt");
    expect(fixes).toHaveLength(2);
    expect(fixes[0]?.choiceGroup).toBeTruthy();
    expect(fixes[0]?.choiceGroup).toBe(fixes[1]?.choiceGroup);
  });
  it("ignores prose, members, style blocks and multiline labels", () => {
    for (const source of [
      "note right\nA > B\nskinparam\nend note",
      "legend\nA > B\nend legend",
      "class C\n{\nA > B\nparticipant\n}",
      "skinparam sequence\n{\nparticipant\n}",
      "<style>\nA > B\n</style>",
      'usecase X as "Description\nA > B\nskinparam\nend"',
      "/'\nA > B\n'/",
    ])
      expect(statementIssues("class", `@startuml\n${source}\n@enduml`), source).toEqual([]);
  });
  it("repairs quoted, bracketed and Unicode relationships without replacing endpoints", () => {
    for (const [kind, statement, expected] of [
      ["class", '"First class" > "Second class"', '"First class" -> "Second class"'],
      ["component", "[Service A] < [Service B]", "[Service A] <- [Service B]"],
      ["class", "Åsa > Björn", "Åsa -> Björn"],
    ] as const)
      expect(statementIssues(kind, statement)[0]?.replacement).toBe(expected);
  });
});

it("pins official renderer coverage and the exact repair inputs", () => {
  const inventory = operandAuditInventory();
  const hash = (source: string) => createHash("sha256").update(source).digest("hex");
  expect(observations.results).toHaveLength(inventory.length);
  let rejected = 0;
  for (const [index, item] of inventory.entries()) {
    const observed = observations.results[index]!;
    expect(observed.id).toBe(item.id);
    expect(observed.baseline.hash, item.id).toBe(hash(item.original));
    expect(observed.mutated.hash, item.id).toBe(hash(item.source));
    expect(observed.diagnostics, item.id).toEqual(JSON.parse(JSON.stringify(item.diagnostics)));
    expect(observed.repairs).toHaveLength(item.repairs.length);
    if (observed.mutated.status === "rejected") {
      rejected++;
      expect(item.diagnostics.length, item.id).toBeGreaterThan(0);
    } else expect(item.diagnostics, item.id).toEqual([]);
    for (const [repairIndex, repair] of item.repairs.entries()) {
      const result = observed.repairs[repairIndex]!;
      expect(result.rendered.hash).toBe(hash(repair.source));
      expect(result.rendered.status).toBe("accepted");
      // Only the explicitly chosen predecessor start may differ from the end baseline.
      expect(result.equivalent, item.id).toBe(!(item.mutation === "[B] starts at [A]'s" && repairIndex === 1));
    }
  }
  expect(rejected).toBe(39);
});
