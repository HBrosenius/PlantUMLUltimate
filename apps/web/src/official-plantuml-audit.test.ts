import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import classExamples from "../../../tests/fixtures/official-plantuml/class.json";
import usecaseExamples from "../../../tests/fixtures/official-plantuml/usecase.json";
import { parseClassDiagram } from "@plantuml-studio/diagram-class";
import { parseUseCase } from "@plantuml-studio/diagram-usecase";
import { diagnosticsForDiagram, quickFixesForDiagram } from "./diagram-diagnostics";

// Review snapshot changes as compatibility changes, not automatic baseline updates.
// Set PLANTUML_AUDIT_REPORT to write the complete, source-linked gap inventory.
describe("official PlantUML example validation audit", () => {
  for (const [kind, corpus] of [
    ["class", classExamples],
    ["usecase", usecaseExamples],
  ] as const) {
    it(`audits every ${kind} example`, () => {
      expect(corpus.examples.length).toBe(kind === "class" ? 86 : 27);
      const results = corpus.examples.map((source, index) => {
        const parsed = kind === "class" ? parseClassDiagram(source) : parseUseCase(source);
        const line = (offset: number) => source.slice(0, offset).split("\n").length;
        return {
          example: index + 1,
          diagnostics: diagnosticsForDiagram(kind, source).map((d) => ({
            line: line(d.from),
            severity: d.severity,
            message: d.message,
          })),
          repairs: quickFixesForDiagram(kind, source).map((fix) => ({
            line: line(fix.from),
            message: fix.message,
            replacement: fix.replacement,
          })),
          preserved: parsed.unknown.map((item) => ({ line: line(item.range.from), text: item.text })),
        };
      });
      for (const result of results) {
        expect(result.diagnostics, `${kind} example ${result.example}`).toEqual([]);
        expect(result.repairs, `${kind} example ${result.example}`).toEqual([]);
      }
      expect(results).toMatchSnapshot();
      if (process.env.PLANTUML_AUDIT_REPORT) {
        const path = `${process.env.PLANTUML_AUDIT_REPORT}-${kind}.json`;
        writeFileSync(path, JSON.stringify({ url: corpus.url, retrieved: corpus.retrieved, results }, null, 2) + "\n");
      }
    });
  }
});
