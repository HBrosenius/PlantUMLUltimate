import { describe, expect, it } from "vitest";
import {
  collectClassSymbolOccurrences,
  deleteClassEntity,
  deleteClassMember,
  deleteClassNote,
  deleteClassRelationship,
  insertClassEntity,
  insertClassMember,
  insertClassNote,
  insertClassPackage,
  insertClassRelationship,
  moveClassEntityToPackage,
  moveClassPackageToPackage,
  parseClassDiagram,
  reorderClassEntity,
  reorderClassMember,
  updateClassEntity,
  updateClassMember,
  updateClassNote,
  updateClassRelationship,
} from "./index";
describe("class operations", () => {
  it("finds semantic entity references in member types without matching relationship labels or note text", () => {
    const source =
      '@startuml\nclass "Customer account" as Account {\n  +owner: Customer\n}\ninterface Customer\nAccount --> Customer : Account serves Customer\nnote right of Account : Account note\n@enduml';
    const occurrences = collectClassSymbolOccurrences(source, parseClassDiagram(source));

    expect(occurrences.filter((item) => item.key === "account").map((item) => item.value)).toEqual([
      "Customer account",
      "Account",
      "Account",
      "Account",
    ]);
    expect(occurrences.filter((item) => item.key === "customer").map((item) => item.value)).toEqual([
      "Customer",
      "Customer",
      "Customer",
    ]);
    expect(occurrences.map((item) => source.slice(item.range.from, item.range.to))).toEqual(
      occurrences.map((item) => item.value),
    );
  });

  it("finds class references in parameter, return, and generic types", () => {
    const source =
      "@startuml\nclass Order\nclass Customer\nclass Batch<T extends Order>\nclass Service {\n  +customer: Customer\n  +load(order: Order, fallback: List<Customer>): Map<Order, Customer>\n}\n@enduml";
    const occurrences = collectClassSymbolOccurrences(source, parseClassDiagram(source));

    expect(occurrences.filter((item) => item.key === "order").map((item) => item.value)).toEqual([
      "Order",
      "Order",
      "Order",
      "Order",
    ]);
    expect(occurrences.filter((item) => item.key === "customer").map((item) => item.value)).toEqual([
      "Customer",
      "Customer",
      "Customer",
      "Customer",
    ]);
    expect(occurrences.some((item) => item.value === "order")).toBe(false);
    expect(occurrences.some((item) => item.value === "fallback")).toBe(false);
  });

  it("inserts and edits member blocks", () => {
    const source = "@startuml\n@enduml";
    const inserted = insertClassEntity(source, {
      kind: "class",
      label: "Order",
      alias: "Order",
      members: ["+total: Money", "+submit(): void"],
    });
    expect(inserted).toContain('class "Order" as Order {\n  +total: Money');
    const d = parseClassDiagram(inserted);
    const updated = updateClassEntity(inserted, d, d.entities[0]!, {
      kind: "class",
      label: "Purchase",
      alias: "Order",
      members: ["+submit(): void"],
    });
    expect(updated).toContain('class "Purchase" as Order');
  });
  it("edits individual structured members without rewriting surrounding source", () => {
    let source =
      "@startuml\nclass Account {\n  -id: UUID\n  {static} +open(owner: User): Account\n  custom member syntax\n}\n@enduml";
    let document = parseClassDiagram(source);
    expect(document.entities[0]!.members).toMatchObject([
      { kind: "field", name: "id", type: "UUID", visibility: "-" },
      { kind: "method", name: "open", parameters: "owner: User", type: "Account", isStatic: true },
      { kind: "raw", text: "custom member syntax" },
    ]);
    source = updateClassMember(source, document.entities[0]!.members[0]!, {
      kind: "field",
      name: "identifier",
      type: "UUID",
      visibility: "-",
    });
    expect(source).toContain("  -identifier: UUID\n  {static} +open");
    document = parseClassDiagram(source);
    source = insertClassMember(source, document.entities[0]!, { kind: "method", name: "close", type: "void" });
    expect(source).toContain("  close(): void\n}");
    document = parseClassDiagram(source);
    source = reorderClassMember(source, document.entities[0]!.members[3]!, document.entities[0]!.members[2]!);
    document = parseClassDiagram(source);
    expect(document.entities[0]!.members.map((item) => item.name ?? item.text)).toEqual([
      "identifier",
      "open",
      "close",
      "custom member syntax",
    ]);
    source = deleteClassMember(source, document.entities[0]!, document.entities[0]!.members[3]!);
    expect(source).not.toContain("custom member syntax");
  });
  it("round-trips packages, notes, colors, and source ordering", () => {
    let source = '@startuml\nclass "A" as A\nclass "B" as B\n@enduml';
    source = insertClassPackage(source, parseClassDiagram(source), {
      kind: "package",
      label: "Domain",
      alias: "Domain",
      color: "LightBlue",
    });
    let document = parseClassDiagram(source);
    source = insertClassPackage(source, document, { kind: "namespace", label: "Internal", parentId: "domain" });
    document = parseClassDiagram(source);
    expect(document.packages.find((item) => item.id === "internal")?.parentId).toBe("domain");
    expect(
      moveClassPackageToPackage(
        source,
        document,
        document.packages.find((item) => item.id === "domain")!,
        "internal",
      ),
    ).toBe(source);
    source = moveClassPackageToPackage(
      source,
      document,
      document.packages.find((item) => item.id === "internal")!,
    );
    document = parseClassDiagram(source);
    expect(document.packages.find((item) => item.id === "internal")?.parentId).toBeUndefined();
    source = moveClassEntityToPackage(source, document, document.entities[0]!, "domain");
    document = parseClassDiagram(source);
    expect(document.entities.find((item) => item.id === "a")?.packageId).toBe("domain");
    source = insertClassNote(source, document, {
      targetId: "a",
      placement: "right",
      text: "Important\ndetails",
      color: "Wheat",
    });
    document = parseClassDiagram(source);
    expect(document.notes[0]).toMatchObject({ targetId: "a", placement: "right", color: "#Wheat" });
    source = updateClassNote(source, document, document.notes[0]!, {
      targetId: "b",
      placement: "left",
      text: "Moved",
    });
    document = parseClassDiagram(source);
    expect(document.notes[0]).toMatchObject({ targetId: "b", placement: "left", text: "Moved" });
    source = deleteClassNote(source, document.notes[0]!);
    document = parseClassDiagram(source);
    source = moveClassEntityToPackage(
      source,
      document,
      document.entities.find((item) => item.id === "b")!,
      "domain",
    );
    document = parseClassDiagram(source);
    const [a, b] = document.entities;
    source = reorderClassEntity(source, b!, a!, "before");
    expect(source.indexOf('class "B"')).toBeLessThan(source.indexOf('class "A"'));
    expect(parseClassDiagram(source).notes).toHaveLength(0);
  });
  it("keeps relationships and their appearance when an endpoint is renamed", () => {
    const source =
      '@startuml\nclass "A" as A\nclass "B" as B\nA -[#Red,dashed]-> B : link\nnote right of A : details\n@enduml';
    const document = parseClassDiagram(source);
    expect(document.relationships[0]).toMatchObject({ color: "#Red", lineStyle: "dashed" });
    const updated = updateClassEntity(source, document, document.entities[0]!, {
      kind: "class",
      label: "Renamed",
      alias: "R",
      members: [],
    });
    expect(updated).toContain("R -[#Red,dashed]-> B : link");
    expect(updated).toContain("note right of R : details");
    expect(parseClassDiagram(updated).diagnostics).toHaveLength(0);
  });
  it("preserves authored arrows and round-trips relationship notes", () => {
    let source = "@startuml\nclass A\nclass B\nA -left[#Blue,dotted]-> B : calls\n@enduml";
    let document = parseClassDiagram(source);
    source = updateClassRelationship(source, document, document.relationships[0]!, {
      from: "a",
      to: "b",
      kind: "association",
      label: "invokes",
      arrow: document.relationships[0]!.arrow,
      ...(document.relationships[0]!.color ? { color: document.relationships[0]!.color } : {}),
      ...(document.relationships[0]!.lineStyle ? { lineStyle: document.relationships[0]!.lineStyle } : {}),
    });
    expect(source).toContain("A -left[#Blue,dotted]-> B : invokes");
    document = parseClassDiagram(source);
    source = insertClassNote(source, document, {
      targetId: "relationship-0",
      placement: "right",
      text: "Important\ncontract",
      color: "Wheat",
    });
    expect(source).toContain("A -left[#Blue,dotted]-> B : invokes\nnote on link #Wheat\nImportant\ncontract\nend note");
    document = parseClassDiagram(source);
    expect(document.notes[0]).toMatchObject({ targetId: "relationship-0", text: "Important\ncontract" });
    source = updateClassNote(source, document, document.notes[0]!, {
      targetId: "a",
      placement: "left",
      text: "Now attached to A",
    });
    expect(source).toContain("note left of A : Now attached to A");
    document = parseClassDiagram(source);
    expect(document.notes[0]).toMatchObject({ targetId: "a", placement: "left" });
    source = updateClassNote(source, document, document.notes[0]!, {
      targetId: "relationship-0",
      placement: "right",
      text: "Back on the relationship",
    });
    expect(source).toContain("A -left[#Blue,dotted]-> B : invokes\nnote on link\nBack on the relationship\nend note");
    document = parseClassDiagram(source);
    expect(document.notes[0]).toMatchObject({ targetId: "relationship-0" });
    expect(document.notes[0]).not.toHaveProperty("placement");
    source = deleteClassRelationship(source, document.relationships[0]!, document);
    expect(source).not.toContain("note on link");
  });
  it("creates and removes relationships with an entity", () => {
    const source = '@startuml\nclass "A" as A\nclass "B" as B\n@enduml';
    const d = parseClassDiagram(source);
    const linked = insertClassRelationship(source, d, {
      from: "a",
      to: "b",
      kind: "composition",
      label: "owns",
      toMultiplicity: "many",
    });
    expect(linked).toContain('A *--> "many" B : owns');
    const parsed = parseClassDiagram(linked);
    expect(deleteClassEntity(linked, parsed, parsed.entities[0]!)).not.toContain("owns");
  });
});
