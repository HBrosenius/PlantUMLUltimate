import { describe, expect, it } from "vitest";
import { findClassObjectAt, parseClassDiagram } from "./parser";
describe("parseClassDiagram", () => {
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
  it("reports broken containers and endpoints", () => {
    const d = parseClassDiagram("@startuml\npackage P {\nclass A\nA --> Missing\n@enduml");
    expect(d.diagnostics.map((x) => x.code)).toEqual(
      expect.arrayContaining(["unterminated-package", "unknown-endpoint"]),
    );
  });
});
