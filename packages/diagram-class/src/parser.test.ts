import { describe, expect, it } from "vitest";
import { findClassObjectAt, parseClassDiagram } from "./parser";
describe("parseClassDiagram", () => {
  it("accepts implicit classes in relationships with multiplicities", () => {
    const source = `@startuml

Class01 "1" *-- "many" Class02 : contains

Class03 o-- Class04 : aggregation

Class05 --> "1" Class06

@enduml`;
    for (const value of [source, source.replaceAll("\n", "\r\n")]) {
      const document = parseClassDiagram(value);
      expect(document.diagnostics).toEqual([]);
      expect(document.unknown).toEqual([]);
      expect(document.relationships).toMatchObject([
        {
          from: "class01",
          to: "class02",
          kind: "composition",
          fromMultiplicity: "1",
          toMultiplicity: "many",
          label: "contains",
        },
        { from: "class03", to: "class04", kind: "aggregation", label: "aggregation" },
        { from: "class05", to: "class06", kind: "association", toMultiplicity: "1" },
      ]);
    }
  });

  it("allows notes on implicit classes and resolves later aliases", () => {
    const document = parseClassDiagram(`@startuml
A --> "Display name"
class "Display name" as B
note right of A : Implicit class
note right of Missing : Unknown target
@enduml`);
    expect(document.relationships[0]).toMatchObject({ from: "a", to: "b" });
    expect(document.diagnostics.map((item) => item.code)).toEqual(["unknown-note-target"]);
  });

  it("parses component diagram elements with aliases, stereotypes, and relationships", () => {
    const document = parseClassDiagram(`@startuml
component "Web application" as Web <<frontend>>
database "Orders" as Db
queue Events
Web --> Db : reads
Web ..> Events : publishes
@enduml`);

    expect(document.entities.map(({ kind, label, alias }) => ({ kind, label, alias }))).toEqual([
      { kind: "component", label: "Web application", alias: "Web" },
      { kind: "database", label: "Orders", alias: "Db" },
      { kind: "queue", label: "Events", alias: undefined },
    ]);
    expect(document.relationships).toHaveLength(2);
    expect(document.unknown).toHaveLength(0);
  });

  it("rejects oversized input before applying grammar expressions", () => {
    expect(() => parseClassDiagram(" ".repeat(100_001))).toThrow(/100,000 character limit/);
  });

  it("keeps nested package aliases distinct", () => {
    const document = parseClassDiagram(
      '@startuml\npackage "Ordering" {\npackage "Reporting" as Reports #Lavender {\nclass Order\n}\n}\n@enduml',
    );
    expect(document.packages).toEqual([
      expect.objectContaining({ id: "ordering", label: "Ordering" }),
      expect.objectContaining({ id: "reports", label: "Reporting", parentId: "ordering" }),
    ]);
    expect(findClassObjectAt(document, document.packages[1]!.openRange.from)?.id).toBe("reports");
  });
  it("parses entities, members, packages, notes and all relationship families", () => {
    const d = parseClassDiagram(`@startuml
package "Domain" as D {
abstract class "Account" as Account<T> <<Entity>> #LightBlue {
  -id: UUID
  {static} +open(): Account
}
interface Repository
enum Status { ACTIVE }
}
Account --|> Repository
Account *--> "many" Status : owns
note right of Account : Aggregate root
@enduml`);
    expect(d.entities).toHaveLength(3);
    expect(d.entities.find((item) => item.id === "status")?.members.map((item) => item.text)).toEqual(["ACTIVE"]);
    expect(d.entities[0]).toMatchObject({
      id: "account",
      kind: "abstract",
      generic: "T",
      packageId: "d",
      members: [{ text: "-id: UUID" }, { text: "{static} +open(): Account" }],
    });
    expect(d.relationships.map((x) => x.kind)).toEqual(["inheritance", "composition"]);
    expect(d.notes[0]?.targetId).toBe("account");
    expect(d.diagnostics).toEqual([]);
  });
  it("parses inline members and notes on relationships", () => {
    const document = parseClassDiagram(`@startuml
class A { +id: UUID; +save(): void }
class B
A -left[#Blue,dotted]-> B : unusual arrow
note on link #Wheat
  Important relationship
end note
@enduml`);
    expect(document.entities[0]?.members.map((item) => item.text)).toEqual(["+id: UUID", "+save(): void"]);
    expect(document.relationships[0]).toMatchObject({
      arrow: "-left[#Blue,dotted]->",
      color: "#Blue",
      lineStyle: "dotted",
    });
    expect(document.notes[0]).toMatchObject({
      targetId: "relationship-0",
      text: "Important relationship",
      color: "#Wheat",
    });
    expect(document.diagnostics).toHaveLength(0);
  });
  it("reports broken containers while allowing implicitly declared endpoints", () => {
    const d = parseClassDiagram("@startuml\npackage P {\nclass A\nA --> Missing\n@enduml");
    expect(d.diagnostics.map((x) => x.code)).toEqual(["unterminated-package"]);
  });
});

describe("parseClassDiagram line endings", () => {
  it("parses CRLF sources like LF sources", () => {
    const source = "@startuml\nclass A\nclass B {\n  +name: String\n}\nA --> B : uses\n@enduml\n";
    const lf = parseClassDiagram(source);
    const crlf = parseClassDiagram(source.replace(/\n/g, "\r\n"));
    expect(crlf.relationships).toHaveLength(1);
    expect(crlf.relationships[0]?.label).toBe(lf.relationships[0]?.label);
    expect(lf.relationships[0]?.label).toBeTruthy();
    expect(crlf.entities.map((entity) => entity.label)).toEqual(["A", "B"]);
    expect(crlf.unknown).toEqual([]);
  });
});

describe("parseClassDiagram robustness", () => {
  it("parses relationships between non-ASCII class names", () => {
    const document = parseClassDiagram("@startuml\nclass Åsa\nclass Björn\nÅsa --> Björn : känner\n@enduml");
    expect(document.relationships).toMatchObject([{ from: "åsa", to: "björn", label: "känner" }]);
    expect(document.diagnostics).toEqual([]);
  });

  it("skips block comments and comment lines inside class bodies", () => {
    const source =
      "@startuml\n/'\nclass Hidden\n'/\n/' class AlsoHidden '/\nclass Shown {\n  ' not a member\n  +name: String\n}\n@enduml";
    const document = parseClassDiagram(source);
    expect(document.entities.map((entity) => entity.label)).toEqual(["Shown"]);
    expect(document.entities[0]!.members.map((member) => member.text)).toEqual(["+name: String"]);
    expect(document.unknown).toEqual([]);
    const range = document.entities[0]!.sourceRange;
    expect(source.slice(range.from, range.from + 11)).toBe("class Shown");
  });

  it("parses only the first of several @startuml diagrams and warns", () => {
    const document = parseClassDiagram("@startuml\nclass A\n@enduml\n@startuml\nclass B\n@enduml");
    expect(document.entities.map((entity) => entity.label)).toEqual(["A"]);
    expect(document.diagnostics).toMatchObject([{ severity: "warning", code: "multiple-diagrams" }]);
  });
});

it("keeps case-distinct classes and packages addressable", () => {
  const source = "@startuml\nclass a\npackage A {\nclass Child\n}\na --> Child\n@enduml";
  const document = parseClassDiagram(source);
  expect(document.diagnostics).toEqual([]);
  expect(document.entities[0]?.id).toBe("a");
  expect(document.packages[0]?.id).toBe("A");
  expect(document.entities[1]?.packageId).toBe("A");
  expect(document.relationships[0]?.from).toBe("a");
});

it("retains genuine alias conflicts and unknown note errors", () => {
  const document = parseClassDiagram(
    "@startuml\nclass One as Shared\nclass Two as Shared\nnote right of Missing::field : unknown\n@enduml",
  );
  expect(document.diagnostics.map((item) => item.code)).toEqual([
    "duplicate-alias",
    "duplicate-alias",
    "unknown-note-target",
  ]);
});

it("preserves JSON braces inside strings without swallowing following classes", () => {
  const document = parseClassDiagram(
    `@startuml\njson JSON ${JSON.stringify({ value: '{"}' }, null, 2)}\nclass After\n@enduml`,
  );
  expect(document.diagnostics).toEqual([]);
  expect(document.entities.map((item) => item.label)).toEqual(["After"]);
});

it("reports an unclosed together group while parsing its classes", () => {
  const document = parseClassDiagram("@startuml\ntogether {\nclass A\n@enduml");
  expect(document.entities).toHaveLength(1);
  expect(document.diagnostics.map((item) => item.code)).toEqual(["unterminated-group"]);
});
