import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import engine from "@plantuml/core/package.json";
import observations from "../../../tests/fixtures/official-plantuml/renderer-observations.json";
import { describe, expect, it } from "vitest";
import classExamples from "../../../tests/fixtures/official-plantuml/class.json";
import usecaseExamples from "../../../tests/fixtures/official-plantuml/usecase.json";
import type { DiagramQuickFix } from "./diagram-diagnostics";
import { diagnosticsForDiagram, quickFixesForDiagram } from "./diagram-diagnostics";

const mutations = [
  { name: "unknown-command", pattern: /^@enduml/m, replacement: "invalid_plantuml_command !\n@enduml" },
  { name: "misspelled-opening-tag", pattern: /^@startuml/m, replacement: "@startumlx" },
  { name: "missing-closing-tag", pattern: /\n@enduml\s*$/, replacement: "" },
  { name: "missing-closing-brace", pattern: /^([ \t]*)}[ \t]*\n/m, replacement: "" },
  { name: "duplicated-closing-brace", pattern: /^([ \t]*)}[ \t]*$/m, replacement: "$1}}" },
  { name: "missing-note-terminator", pattern: /^end note[ \t]*\n/m, replacement: "" },
  { name: "misspelled-declaration", pattern: /^(\s*)(class|actor|usecase)\b/m, replacement: "$1invalid_declaration" },
  { name: "missing-declaration-quote", pattern: /^(\s*(?:class|actor|usecase)\s+)"/m, replacement: "$1" },
] as const;
const hash = (source: string) => createHash("sha256").update(source).digest("hex");

function compatibleBatch(source: string, fixes: readonly DiagramQuickFix[]) {
  if (fixes.length < 2) return [];
  const sorted = [...fixes].sort((a, b) => a.from - b.from || a.to - b.to);
  const groups = new Set<string>();
  for (let index = 0; index < sorted.length; index++) {
    const fix = sorted[index]!;
    const previous = sorted[index - 1];
    if (previous && (previous.to > fix.from || previous.from === fix.from)) return [];
    if (fix.choiceGroup && groups.has(fix.choiceGroup)) return [];
    if (fix.choiceGroup) groups.add(fix.choiceGroup);
  }
  let repaired = source;
  for (const fix of sorted.reverse()) repaired = repaired.slice(0, fix.from) + fix.replacement + repaired.slice(fix.to);
  return [{ mode: "batch", message: "Apply all compatible fixes", source: repaired }];
}

export function mutationInventory() {
  return (
    [
      ["class", classExamples],
      ["usecase", usecaseExamples],
    ] as const
  ).flatMap(([kind, corpus]) =>
    corpus.examples.flatMap((original, index) =>
      mutations.flatMap((mutation) => {
        if (!mutation.pattern.test(original)) return [];
        const source = original.replace(mutation.pattern, mutation.replacement);
        const fixes = quickFixesForDiagram(kind, source);
        return [
          {
            id: `${kind}-${index + 1}-${mutation.name}`,
            kind,
            example: index + 1,
            mutation: mutation.name,
            original,
            source,
            diagnostics: diagnosticsForDiagram(kind, source).map(({ severity, message, from, to }) => ({
              severity,
              message,
              from,
              to,
            })),
            repairs: [
              ...fixes.map((fix) => ({
                mode: "individual",
                message: fix.message,
                source: source.slice(0, fix.from) + fix.replacement + source.slice(fix.to),
              })),
              ...compatibleBatch(source, fixes),
            ],
          },
        ];
      }),
    ),
  );
}

describe("controlled mutations of official PlantUML examples", () => {
  it("exports every applicable mutation and each individual repair candidate", () => {
    const inventory = mutationInventory();
    expect(inventory.length).toBe(523);
    expect(new Set(inventory.map((item) => `${item.kind}-${item.example}`)).size).toBe(113);
    expect(new Set(inventory.map((item) => item.id)).size).toBe(inventory.length);
    expect(inventory.every((item) => hash(item.original) !== hash(item.source))).toBe(true);
    if (process.env.PLANTUML_MUTATION_EXPORT) {
      writeFileSync(process.env.PLANTUML_MUTATION_EXPORT, JSON.stringify(inventory, null, 2) + "\n");
    }
  });
  it.skipIf(Boolean(process.env.PLANTUML_MUTATION_EXPORT))(
    "matches the recorded official renderer inputs and repair outcomes",
    () => {
      const inventory = mutationInventory();
      expect(observations.version).toBe(engine.version);
      expect(observations.engine).toBe("@plantuml/core");
      expect(observations.results).toHaveLength(inventory.length);
      const summary = {
        rejected: 0,
        detected: 0,
        missed: [] as string[],
        changedRepairs: [] as string[],
        incompleteRepairs: [] as string[],
      };
      for (let index = 0; index < inventory.length; index++) {
        const item = inventory[index]!;
        const observed = observations.results[index]!;
        expect(observed.id).toBe(item.id);
        expect(observed.originalHash, item.id).toBe(hash(item.original));
        expect(observed.sourceHash, item.id).toBe(hash(item.source));
        expect(observed.baselineStatus, item.id).toBe("accepted");
        expect(observed.rendererStatus, item.id).not.toBe("failure");
        expect(observed.diagnostics, item.id).toEqual(item.diagnostics);
        expect(observed.repairs, item.id).toHaveLength(item.repairs.length);
        if (observed.rendererStatus === "rejected") {
          summary.rejected++;
          if (item.diagnostics.some((diagnostic) => diagnostic.severity === "error")) summary.detected++;
          else summary.missed.push(item.id);
        }
        for (let repairIndex = 0; repairIndex < item.repairs.length; repairIndex++) {
          const candidate = item.repairs[repairIndex]!;
          const outcome = observed.repairs[repairIndex]!;
          expect(outcome.sourceHash, item.id).toBe(hash(candidate.source));
          expect(outcome.message, item.id).toBe(candidate.message);
          expect(outcome.mode, item.id).toBe(candidate.mode);
          expect(outcome.exactRestoration, item.id).toBe(candidate.source === item.original);
          expect(outcome.rendererStatus, item.id).not.toBe("failure");
          if (["missing-closing-tag", "misspelled-opening-tag", "missing-declaration-quote"].includes(item.mutation)) {
            expect(outcome.rendererStatus, item.id).toBe("accepted");
            expect(outcome.equivalent, item.id).toBe(true);
          }
          if (outcome.rendererStatus === "accepted") {
            expect(outcome.equivalent, `${item.id}:${outcome.mode}`).toBe(true);
          }
          if (outcome.rendererStatus === "rejected")
            summary.incompleteRepairs.push(`${item.id}:${outcome.mode}:${repairIndex}`);
          else if (!outcome.equivalent) summary.changedRepairs.push(`${item.id}:${outcome.mode}:${repairIndex}`);
        }
      }
      // Snapshot explicitly exposes known misses/unsafe candidates. Review changes;
      // this is a regression baseline, not a claim of complete syntax validation.
      expect(summary).toMatchSnapshot();
    },
  );
});
