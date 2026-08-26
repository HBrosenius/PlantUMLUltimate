import { describe, expect, it } from "vitest";
import {
  deleteClassEntity,
  deleteClassNote,
  insertClassEntity,
  insertClassNote,
  insertClassPackage,
  insertClassRelationship,
  moveClassEntityToPackage,
  moveClassPackageToPackage,
  parseClassDiagram,
  reorderClassEntity,
  updateClassEntity,
  updateClassNote,
} from "./index";
describe("class operations", () => {
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
    const source = '@startuml\nclass "A" as A\nclass "B" as B\nA -[#Red,dashed]-> B : link\n@enduml';
    const document = parseClassDiagram(source);
    expect(document.relationships[0]).toMatchObject({ color: "#Red", lineStyle: "dashed" });
    const updated = updateClassEntity(source, document, document.entities[0]!, {
      kind: "class",
      label: "Renamed",
      alias: "R",
      members: [],
    });
    expect(updated).toContain("R -[#Red,dashed]-> B : link");
    expect(parseClassDiagram(updated).diagnostics).toHaveLength(0);
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
