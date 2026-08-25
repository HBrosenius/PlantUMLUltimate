import { describe, expect, it } from "vitest";
import {
  deleteUseCaseElement,
  deleteUseCasePackage,
  insertUseCaseElement,
  insertUseCaseNote,
  insertUseCasePackage,
  insertUseCaseRelationship,
  moveUseCaseElementToPackage,
  reorderUseCaseElement,
  parseUseCase,
  updateUseCaseElement,
  updateUseCaseRelationship,
} from "./index";

describe("Use Case source operations", () => {
  it("inserts an element before the end directive", () => {
    expect(insertUseCaseElement("@startuml\n@enduml", { kind: "actor", label: "Customer", color: "LightBlue" })).toBe(
      '@startuml\nactor "Customer" #LightBlue\n@enduml',
    );
  });

  it("renames relationship endpoints with an element", () => {
    const source = '@startuml\nactor "Customer" as C\nusecase "Order" as O\nC --> O\n@enduml';
    const document = parseUseCase(source);
    const updated = updateUseCaseElement(source, document, document.actors[0]!, {
      kind: "actor",
      label: "Buyer",
      alias: "B",
    });
    expect(updated).toContain('actor "Buyer" as B');
    expect(updated).toContain("B --> O");
  });

  it("deletes attached relationships", () => {
    const source = '@startuml\nactor "Customer" as C\nusecase "Order" as O\nC --> O\n@enduml';
    const document = parseUseCase(source);
    expect(deleteUseCaseElement(source, document, document.actors[0]!)).not.toContain("C --> O");
  });

  it("creates and updates semantic relationships", () => {
    const source = '@startuml\nactor "Customer" as C\nusecase "Order" as O\n@enduml';
    const document = parseUseCase(source);
    const inserted = insertUseCaseRelationship(source, document, { from: "c", to: "o", kind: "include" });
    expect(inserted).toContain("C ..> O : <<include>>");
    const parsed = parseUseCase(inserted);
    const updated = updateUseCaseRelationship(inserted, parsed, parsed.relationships[0]!, {
      from: "c",
      to: "o",
      kind: "association",
      label: "places",
    });
    expect(updated).toContain("C --> O : places");
    const styled = updateUseCaseRelationship(inserted, parsed, parsed.relationships[0]!, {
      from: "c",
      to: "o",
      kind: "association",
      lineStyle: "dashed",
      direction: "right",
      color: "#Blue",
    });
    expect(styled).toContain("C -[#Blue,dashed]right-> O");
    expect(parseUseCase(styled).relationships[0]).toMatchObject({
      color: "#Blue",
      lineStyle: "dashed",
      direction: "right",
    });
  });

  it("adds packages and notes and unwraps packages on deletion", () => {
    const source = '@startuml\nactor "Customer" as C\n@enduml';
    const packaged = insertUseCasePackage(source, { kind: "rectangle", label: "Ordering" });
    expect(packaged).toContain('rectangle "Ordering" {\n}');
    const noted = insertUseCaseNote(source, parseUseCase(source), {
      targetId: "c",
      placement: "right",
      text: "Primary user",
    });
    expect(noted).toContain("note right of C : Primary user");
    const nested = '@startuml\nrectangle "Ordering" {\nusecase "Order" as O\n}\n@enduml';
    const parsed = parseUseCase(nested);
    const unwrapped = deleteUseCasePackage(nested, parsed.packages[0]!);
    expect(unwrapped).toContain('usecase "Order" as O');
    expect(unwrapped).not.toContain("rectangle");
  });

  it("moves an element into and out of a system boundary", () => {
    const source =
      '@startuml\nactor "Customer" as C\nrectangle "Ordering" as System {\nusecase "Order" as O\n}\n@enduml';
    const document = parseUseCase(source);
    const inside = moveUseCaseElementToPackage(source, document, document.actors[0]!, "system");
    expect(inside.indexOf('actor "Customer" as C')).toBeGreaterThan(inside.indexOf('rectangle "Ordering"'));
    expect(inside.indexOf('actor "Customer" as C')).toBeLessThan(inside.indexOf("}\n@enduml"));
    const parsed = parseUseCase(inside);
    const outside = moveUseCaseElementToPackage(inside, parsed, parsed.actors[0]!);
    expect(parseUseCase(outside).actors[0]?.packageId).toBeUndefined();
  });

  it("moves an element into the innermost nested package", () => {
    const source =
      '@startuml\nactor "Customer" as C\npackage "Outer" as Outer {\nrectangle "Inner" as Inner {\n}\n}\n@enduml';
    const document = parseUseCase(source);
    const moved = moveUseCaseElementToPackage(source, document, document.actors[0]!, "inner");
    expect(parseUseCase(moved).actors[0]).toMatchObject({ packageId: "inner" });
  });

  it("keeps declarations before earlier relationships when moving into a later container", () => {
    const source =
      '@startuml\nactor "Admin" as Admin\nusecase "Order" as Order\nAdmin --> Order : manages\nrectangle "Administration" as Area {\n}\n@enduml';
    const document = parseUseCase(source);
    const moved = moveUseCaseElementToPackage(source, document, document.actors[0]!, "area");
    expect(moved.indexOf('actor "Admin" as Admin')).toBeLessThan(moved.indexOf("Admin --> Order"));
    expect(parseUseCase(moved).actors[0]).toMatchObject({ packageId: "area" });
    expect(parseUseCase(moved).relationships).toHaveLength(1);
  });

  it("reorders peer declarations without moving them across containers", () => {
    const source = '@startuml\nactor "First" as A\nactor "Second" as B\n@enduml';
    const document = parseUseCase(source);
    const reordered = reorderUseCaseElement(source, document.actors[1]!, document.actors[0]!, "before");
    expect(reordered.indexOf('actor "Second"')).toBeLessThan(reordered.indexOf('actor "First"'));
  });

  it("round-trips floating notes and preserves unrelated source", () => {
    const source = "@startuml\nskinparam handwritten true\n@enduml";
    const inserted = insertUseCaseNote(source, parseUseCase(source), {
      alias: "Risk",
      placement: "right",
      text: "First line\nSecond line",
      color: "LightYellow",
    });
    expect(inserted).toContain("note as Risk #LightYellow\nFirst line\nSecond line\nend note");
    expect(inserted).toContain("skinparam handwritten true");
    expect(parseUseCase(inserted).notes[0]).toMatchObject({ alias: "Risk", text: "First line\nSecond line" });
  });

  it("unwraps only the selected nested container and preserves surrounding source", () => {
    const source =
      '@startuml\ntitle Keep me\npackage "Outer" as Outer {\nrectangle "Inner" as Inner {\nusecase "Order" as O\n}\n}\nfooter Also keep me\n@enduml';
    const document = parseUseCase(source);
    const unwrapped = deleteUseCasePackage(
      source,
      document.packages.find((item) => item.id === "inner")!,
    );
    expect(unwrapped).toContain('package "Outer" as Outer {');
    expect(unwrapped).not.toContain('rectangle "Inner"');
    expect(unwrapped).toContain('usecase "Order" as O');
    expect(unwrapped).toContain("title Keep me");
    expect(unwrapped).toContain("footer Also keep me");
    expect(parseUseCase(unwrapped).useCases[0]).toMatchObject({ packageId: "outer" });
  });

  it("edits a large diagram without rewriting surrounding declarations", () => {
    const declarations = Array.from({ length: 150 }, (_, index) => `usecase "Capability ${index}" as U${index}`);
    const source = ["@startuml", "skinparam shadowing false", ...declarations, "U0 --> U149", "@enduml"].join("\n");
    const document = parseUseCase(source);
    const updated = updateUseCaseElement(source, document, document.useCases[75]!, {
      kind: "usecase",
      label: "Renamed capability",
      alias: "U75",
      stereotype: "Core",
    });
    expect(updated).toContain('usecase "Renamed capability" as U75 <<Core>>');
    expect(updated).toContain('usecase "Capability 74" as U74');
    expect(updated).toContain('usecase "Capability 76" as U76');
    expect(updated).toContain("skinparam shadowing false");
    expect(updated).toContain("U0 --> U149");
  });
});
