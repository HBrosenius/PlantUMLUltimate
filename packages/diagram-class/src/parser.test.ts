import { describe, expect, it } from "vitest";
import { parseClassDiagram } from "./parser";
describe("parseClassDiagram", () => {
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
  it("reports broken containers and endpoints", () => {
    const d = parseClassDiagram("@startuml\npackage P {\nclass A\nA --> Missing\n@enduml");
    expect(d.diagnostics.map((x) => x.code)).toEqual(
      expect.arrayContaining(["unterminated-package", "unknown-endpoint"]),
    );
  });
});
