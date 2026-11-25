import { describe, expect, it } from "vitest";
import { c4Diagnostics, c4QuickFixes, c4Snippet } from "./c4-language";
import { c4OutlineEntries } from "./c4-outline";
import { C4_MACROS, c4Macro, isC4Source, parseC4, parseC4Arguments } from "./c4-source";
import { C4_STARTERS } from "./c4-starters";
import { detectDiagramKind, normalizeDiagramKind } from "./diagram-kind";
import { loadBundledLibraryFile } from "./render/include-library";
import { expandIncludes, prepareIncludes } from "./render/includes";
import { diagnosticsForDiagram } from "./diagram-diagnostics";

const CONTAINER = `@startuml
!include <C4/C4_Container>
Person(user, "Customer", "Buys things")
System_Boundary(shop, "Web shop") {
  Container(web, "Web app", "React", "The UI")
  ContainerDb(db, "Database", "PostgreSQL")
}
System_Ext(mail, "Mail")
Rel(user, web, "Uses", "HTTPS")
Rel(web, db, "Reads, and writes")
@enduml`;

describe("C4 macro catalog", () => {
  it("only lists macros the bundled library defines, with the parameters it declares", async () => {
    const text = (
      await Promise.all(
        ["C4", "C4_Context", "C4_Container", "C4_Component", "C4_Dynamic", "C4_Deployment"].map((name) =>
          loadBundledLibraryFile(`C4/${name}.puml`),
        ),
      )
    ).join("\n");
    for (const macro of C4_MACROS) {
      const definition = text.match(new RegExp(`^\\s*!(?:unquoted\\s+)?procedure\\s+${macro.name}\\(([^)]*)\\)`, "im"));
      expect(definition, macro.name).toBeTruthy();
      const declared = definition![1]!
        .split(",")
        .map((item) =>
          item
            .trim()
            .replace(/^\$/, "")
            .replace(/\s*=.*$/, ""),
        )
        .filter(Boolean);
      // The catalog's own names follow the library's; a library name may be `from` where we say `from`.
      expect(declared.slice(0, macro.params.filter((param) => !param.optional).length), macro.name).toEqual(
        macro.params.filter((param) => !param.optional).map((param) => param.name),
      );
    }
  });

  it("makes snippets with the parameters as tab stops", () => {
    expect(c4Snippet(c4Macro("Container")!)).toBe('Container(${1:alias}, "${2:label}", "${3:techn}", "${4:descr}")');
    expect(c4Snippet(c4Macro("Rel")!)).toBe('Rel(${1:from}, ${2:to}, "${3:label}", "${4:techn}")');
    expect(c4Snippet(c4Macro("System_Boundary")!)).toBe('System_Boundary(${1:alias}, "${2:label}") {\n\t${}\n}');
  });
});

describe("C4 detection", () => {
  it("detects the C4 include, the official links and the element macros", () => {
    expect(detectDiagramKind(CONTAINER)).toBe("c4");
    expect(
      detectDiagramKind(
        "@startuml\n!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Context.puml\n@enduml",
      ),
    ).toBe("c4");
    expect(detectDiagramKind('@startuml\nContainer(web, "Web", "React")\n@enduml')).toBe("c4");
    expect(normalizeDiagramKind("c4", "")).toBe("c4");
  });

  it("leaves other diagrams alone", () => {
    expect(detectDiagramKind('@startuml\ncomponent "Container" as C\n@enduml')).toBe("component");
    expect(detectDiagramKind("@startuml\nclass Container\n@enduml")).toBe("class");
    expect(detectDiagramKind("@startuml\nAlice -> Bob\n@enduml")).toBe("sequence");
    expect(detectDiagramKind("@startuml\n!include <awslib/AWSCommon>\n@enduml")).toBeUndefined();
    expect(isC4Source("Rel(a, b, 'x')")).toBe(false);
  });
});

describe("C4 parsing", () => {
  it("reads arguments with quoted commas, nested calls and named parameters", () => {
    expect(parseC4Arguments('web, "Reads, and writes", $techn="SQL", f(a, b)')).toEqual([
      { value: "web" },
      { value: "Reads, and writes" },
      { name: "techn", value: "SQL" },
      { value: "f(a, b)" },
    ]);
  });

  it("reads elements, boundaries with their children, and relationships", () => {
    const document = parseC4(CONTAINER);
    expect(document.includesLibrary).toBe(true);
    expect(document.elements.map((item) => [item.id, item.category, item.label, item.parent, item.external])).toEqual([
      ["user", "person", "Customer", undefined, false],
      ["shop", "boundary", "Web shop", undefined, false],
      ["web", "container", "Web app", "shop", false],
      ["db", "container", "Database", "shop", false],
      ["mail", "system", "Mail", undefined, true],
    ]);
    expect(document.elements.find((item) => item.id === "web")).toMatchObject({
      technology: "React",
      description: "The UI",
      line: 5,
    });
    expect(document.relationships.map((item) => [item.from, item.to, item.label, item.technology])).toEqual([
      ["user", "web", "Uses", "HTTPS"],
      ["web", "db", "Reads, and writes", undefined],
    ]);
  });

  it("lists everything in the outline, grouped under boundaries, with source ranges", () => {
    const entries = c4OutlineEntries(CONTAINER);
    expect(entries.map((entry) => [entry.typeLabel, entry.label, entry.group])).toEqual([
      ["Person", "Customer", undefined],
      ["Boundary", "Web shop", undefined],
      ["Container", "Web app", "Web shop"],
      ["Container", "Database", "Web shop"],
      ["External system", "Mail", undefined],
      ["Relationship", "Uses", "Customer → Web app"],
      ["Relationship", "Reads, and writes", "Web app → Database"],
    ]);
    const web = entries.find((entry) => entry.label === "Web app")!;
    expect(CONTAINER.slice(web.range.from, web.range.to)).toBe('  Container(web, "Web app", "React", "The UI")');
    expect(web.line).toBe(5);
  });
});

describe("C4 diagnostics and starters", () => {
  it("accepts every starter and expands each against the bundled library", async () => {
    for (const starter of C4_STARTERS) {
      expect(detectDiagramKind(starter.source), starter.level).toBe("c4");
      expect(diagnosticsForDiagram("c4", starter.source), starter.level).toEqual([]);
      await prepareIncludes(starter.source, undefined);
      const expanded = expandIncludes(starter.source, undefined);
      expect(expanded.diagnostics, starter.level).toEqual([]);
      expect(expanded.pending, starter.level).toEqual([]);
    }
    expect(C4_STARTERS.map((starter) => starter.level)).toEqual([
      "context",
      "container",
      "component",
      "dynamic",
      "deployment",
    ]);
  });

  it("offers to add the missing include, to close a boundary, and warns about undeclared aliases", () => {
    const missing = '@startuml\nContainer(web, "Web", "React")\n@enduml';
    expect(c4Diagnostics(missing).map((item) => item.message)).toEqual([
      expect.stringContaining("doesn't include the C4 library"),
    ]);
    expect(c4QuickFixes(missing)).toEqual([
      expect.objectContaining({ replacement: "\n!include <C4/C4_Container>", from: 9, to: 9 }),
    ]);
    const unclosed =
      '@startuml\n!include <C4/C4_Container>\nSystem_Boundary(a, "A") {\nContainer(b, "B", "x")\n@enduml';
    expect(c4Diagnostics(unclosed)[0]).toMatchObject({ severity: "error" });
    expect(c4QuickFixes(unclosed)[0]?.replacement).toBe("}\n");
    const extra = "@startuml\n!include <C4/C4_Container>\n}\n@enduml";
    expect(c4QuickFixes(extra)[0]).toMatchObject({ replacement: "" });
    const undeclared = '@startuml\n!include <C4/C4_Container>\nContainer(a, "A", "x")\nRel(a, ghost, "uses")\n@enduml';
    expect(c4Diagnostics(undeclared)).toEqual([
      expect.objectContaining({ severity: "warning", message: expect.stringContaining("ghost isn't declared") }),
    ]);
    // Another include may declare the elements, so nothing is reported then.
    expect(c4Diagnostics(`${undeclared.replace("@enduml", "")}!include common.puml\n@enduml`)).toEqual([]);
  });
});
