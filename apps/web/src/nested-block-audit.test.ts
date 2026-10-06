import { createHash } from "node:crypto";
import observations from "../../../tests/fixtures/official-plantuml/nested-block-renderer-audit.json";
import engine from "@plantuml/core/package.json";
import { writeFileSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { validateGeneratedSource } from "./generated-source-validation";
import shapedNoteObservations from "../../../tests/fixtures/official-plantuml/shaped-note-closer-audit.json";
import { terminatorIssues } from "./diagram-terminator-repairs";
import type { DiagramKind } from "./model";
import { diagnosticsForDiagram, quickFixesForDiagram } from "./diagram-diagnostics";

const examples: Array<{ kind: DiagramKind; body: string }> = [
  {
    kind: "activity",
    body: "start\nif (ready?) then (yes)\n  while (pending?) is (yes)\n    :Work;\n  endwhile (no)\nendif\nstop",
  },
  {
    kind: "activity",
    body: "start\nwhile (pending?) is (yes)\n  if (ready?) then (yes)\n    :Work;\n  endif\nendwhile (no)\nstop",
  },
  {
    kind: "activity",
    body: "start\nswitch (type?)\ncase (one)\n  if (ready?) then (yes)\n    :Work;\n  endif\nendswitch\nstop",
  },
  {
    kind: "activity",
    body: "start\nfork\n  if (ready?) then (yes)\n    :Work;\n  endif\nfork again\n  :Other;\nend fork\nstop",
  },
  {
    kind: "activity",
    body: "start\nrepeat\n  if (ready?) then (yes)\n    :Work;\n  endif\nrepeat while (pending?)\nstop",
  },
  {
    kind: "sequence",
    body: "participant A\nparticipant B\nbox Team\n  participant C\nend box\nalt Ready\n  loop Retry\n    A -> B: Work\n  end\n  A -> B: Done\nend\nA -> B: After",
  },
  {
    kind: "sequence",
    body: "participant A\nparticipant B\nalt Ready\n  group Work\n    A -> B: Work\n  end\n  A -> B: Done\nend\nA -> B: After",
  },
  {
    kind: "sequence",
    body: "participant A\nparticipant B\nalt Ready\n  note over A\n    Explanation\n  end note\n  A -> B: Work\nend\nA -> B: After",
  },
  {
    kind: "sequence",
    body: "participant A\nparticipant B\nalt Ready\n  ref over A,B\n    Reference\n  end ref\n  A -> B: Work\nend\nA -> B: After",
  },
  {
    kind: "class",
    body: "package Outer {\n  package Inner {\n    class A {\n      +work()\n    }\n  }\n}\nclass B\nA --> B",
  },
  { kind: "component", body: "package Outer {\n  package Inner {\n    component A\n  }\n}\ncomponent B\nA --> B" },
  { kind: "usecase", body: "rectangle Outer {\n  package Inner {\n    usecase A\n  }\n}\nactor B\nB --> A" },
];

export function nestedBlockInventory() {
  return examples.flatMap(({ kind, body }, example) => {
    const lines = body.split("\n");
    const wrap = (value: string[]) => `@startuml\n${value.join("\n")}\n@enduml`;
    const original = wrap(lines);
    const variants = [{ mutation: "valid-control", source: original }];
    for (const [index, line] of lines.entries()) {
      const match = line.match(
        /^(\s*)(endif|endwhile|endswitch|end fork|end note|end ref|end box|end|repeat while|})(.*)$/,
      );
      if (!match) continue;
      const token = match[2]!;
      variants.push({
        mutation: `missing-${index}-${token}`,
        source: wrap(lines.filter((_, position) => position !== index)),
      });
      if (token !== "repeat while" && token !== "}") {
        const typo = token === "end" ? "edn" : token.slice(0, -1);
        variants.push({
          mutation: `typo-${index}-${token}`,
          source: wrap(lines.map((value, position) => (position === index ? match[1] + typo + match[3] : value))),
        });
        const wrong =
          token === "endif" ? "endwhile" : kind === "activity" ? "endif" : token === "end box" ? "end" : "end box";
        variants.push({
          mutation: `wrong-${index}-${token}`,
          source: wrap(lines.map((value, position) => (position === index ? match[1] + wrong + match[3] : value))),
        });
      }
      variants.push({
        mutation: `duplicate-${index}-${token}`,
        source: wrap(lines.flatMap((value, position) => (position === index ? [value, value] : [value]))),
      });
    }
    return variants.map(({ mutation, source }) => ({
      id: `${kind}-${example}-${mutation}`,
      kind,
      example,
      mutation,
      source,
      original,
      diagnostics: diagnosticsForDiagram(kind, source),
      repairs: quickFixesForDiagram(kind, source).map((repair) => ({
        mode: "individual",
        message: repair.message,
        source: source.slice(0, repair.from) + repair.replacement + source.slice(repair.to),
      })),
    }));
  });
}

it("exports the nested block renderer audit", () => {
  const inventory = nestedBlockInventory();
  expect(inventory).toHaveLength(100);
  for (const item of inventory) {
    if (item.mutation === "valid-control") expect(item.diagnostics, item.id).toEqual([]);
    else expect(item.diagnostics.length, item.id).toBeGreaterThan(0);
    for (const repair of item.repairs) expect(repair.source, item.id).toBe(item.original);
  }
  if (process.env.PLANTUML_NESTED_EXPORT)
    writeFileSync(process.env.PLANTUML_NESTED_EXPORT, JSON.stringify(inventory, null, 2));
});

it("pins rendering outcomes and exact nested-block repair inputs", () => {
  const inventory = nestedBlockInventory();
  const hash = (source: string) => createHash("sha256").update(source).digest("hex");
  expect(observations.version).toBe(engine.version);
  expect(observations.engine).toBe("@plantuml/core");
  expect(observations.results).toHaveLength(inventory.length);
  let rejected = 0,
    repaired = 0;
  for (const [index, item] of inventory.entries()) {
    const recorded = observations.results[index]!;
    expect(recorded.id).toBe(item.id);
    expect(recorded.baseline.hash).toBe(hash(item.original));
    expect(recorded.baseline.status).toBe("accepted");
    expect(recorded.mutated.hash).toBe(hash(item.source));
    expect(recorded.diagnostics).toEqual(JSON.parse(JSON.stringify(item.diagnostics)));
    if (recorded.mutated.status === "rejected") {
      rejected++;
      expect(item.diagnostics.length).toBeGreaterThan(0);
    }
    expect(recorded.repairs).toHaveLength(item.repairs.length);
    for (const [repairIndex, repair] of item.repairs.entries()) {
      const result = recorded.repairs[repairIndex]!;
      expect(result.rendered.hash).toBe(hash(repair.source));
      expect(result.rendered.status).toBe("accepted");
      expect(result.equivalent).toBe(true);
      expect(result.exactRestoration).toBe(true);
      repaired++;
    }
  }
  expect({ rejected, repaired }).toEqual({ rejected: 20, repaired: 47 });
});

it("preserves all 428 official examples", () => {
  let count = 0;
  for (const kind of ["class", "component", "usecase", "sequence", "activity", "gantt", "wbs"] as const) {
    const corpus = JSON.parse(readFileSync(`tests/fixtures/official-plantuml/${kind}.json`, "utf8")) as {
      examples: string[];
    };
    for (const [index, source] of corpus.examples.entries()) {
      expect(terminatorIssues(kind, source), `${kind} example ${index + 1}`).toEqual([]);
      count++;
    }
  }
  expect(count).toBe(428);
});

for (const newline of ["\n", "\r\n"]) {
  it(`withholds ambiguous closing positions with ${JSON.stringify(newline)}`, () => {
    for (const [kind, body] of [
      ["sequence", "alt Ready\n  loop Retry\n    A -> B: Work\n  end\nA -> B: After"],
      ["activity", "start\nif (ready?) then (yes)\n  while (pending?)\n    :Work;\nendif\nstop"],
      ["activity", "start\nrepeat\n:Work;\nstop"],
      ["sequence", "alt Ready\nref over A,B\nReference\nA -> B: After\nend"],
      ["class", "package Outer {\n  package Inner {\n    class A\n  }\nclass B"],
    ] as const) {
      const source = `@startuml\n${body}\n@enduml`.replaceAll("\n", newline);
      expect(quickFixesForDiagram(kind, source), kind).toEqual([]);
      expect(
        diagnosticsForDiagram(kind, source).some((item) => item.severity === "error"),
        kind,
      ).toBe(true);
    }
  });
  it(`preserves indentation and comments in transposed end repairs with ${JSON.stringify(newline)}`, () => {
    const source = "@startuml\nalt Ready\nA -> B: Work\n  edn ' Done\n@enduml".replaceAll("\n", newline);
    const fixes = quickFixesForDiagram("sequence", source);
    expect(fixes).toHaveLength(1);
    const fix = fixes[0]!;
    expect(source.slice(0, fix.from) + fix.replacement + source.slice(fix.to)).toBe(source.replace("edn", "end"));
  });
}

it("accepts official Sequence partitions and shaped note closers in editor diagnostics", () => {
  const corpus = JSON.parse(readFileSync("tests/fixtures/official-plantuml/sequence.json", "utf8")) as {
    examples: string[];
  };
  for (const index of [27, 31]) {
    const source = corpus.examples[index]!;
    expect(diagnosticsForDiagram("sequence", source).filter((item) => item.severity === "error")).toEqual([]);
    expect(quickFixesForDiagram("sequence", source)).toEqual([]);
  }
});

it("accepts generic and shape-specific note closers in generated Sequence edits", () => {
  const before = "@startuml\nparticipant A\nparticipant B\nA -> B: Before\n@enduml";
  for (const shape of ["hnote", "rnote"] as const) {
    for (const closer of ["end note", `end${shape}`]) {
      const source = `@startuml\nparticipant A\nparticipant B\n${shape} over A,B\nNote text\n${closer}\nA -> B: After\n@enduml`;
      const observed = shapedNoteObservations.results.find((item) => item.id === `${shape}-${closer}`)!;
      expect(observed.mutated.hash).toBe(createHash("sha256").update(source).digest("hex"));
      expect(observed.mutated.status).toBe("accepted");
      for (const newline of ["\n", "\r\n"]) {
        const candidate = source.replaceAll("\n", newline);
        expect(diagnosticsForDiagram("sequence", candidate).filter((item) => item.severity === "error")).toEqual([]);
        expect(quickFixesForDiagram("sequence", candidate)).toEqual([]);
        expect(validateGeneratedSource("sequence", before.replaceAll("\n", newline), candidate).valid).toBe(true);
      }
    }
  }
});
