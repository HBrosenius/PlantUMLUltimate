import { describe, expect, it } from "vitest";
import { parseUseCase } from "./parser";

describe("parseUseCase", () => {
  it("parses actors, use cases, packages, relationships, notes, styles, and stereotypes", () => {
    const source = `@startuml
left to right direction
actor "Main User" as User <<Human>> #AliceBlue
rectangle "Account system" {
  usecase "Log in" as Login <<Main>> #LightGreen
  usecase "Authenticate" as Auth
}
User --> Login
Login ..> Auth : <<include>>
note right of Login #Yellow
Important requirement
end note
@enduml`;
    const document = parseUseCase(source);
    expect(document.diagnostics).toEqual([]);
    expect(document.actors).toMatchObject([
      { id: "user", label: "Main User", stereotype: "Human", color: "#AliceBlue" },
    ]);
    expect(document.useCases).toMatchObject([
      { id: "login", packageId: "account system", stereotype: "Main" },
      { id: "auth", packageId: "account system" },
    ]);
    expect(document.relationships).toMatchObject([
      { from: "user", to: "login", kind: "association" },
      { from: "login", to: "auth", kind: "include" },
    ]);
    expect(document.notes).toMatchObject([{ placement: "right", targetIds: ["login"], text: "Important requirement" }]);
  });

  it("reports duplicate aliases, missing package ends, and unknown endpoints", () => {
    const document = parseUseCase(`@startuml
actor User as Person
usecase Login as Person
package System {
Person --> Missing
@enduml`);
    expect(document.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(["duplicate-alias", "unterminated-package", "unknown-endpoint"]),
    );
  });

  it("supports compact actor and use case forms", () => {
    const document = parseUseCase("@startuml\n:Customer:/ as C\n(Place order)/ as Order\nC --> Order\n@enduml");
    expect(document.actors[0]).toMatchObject({ id: "c", business: true });
    expect(document.useCases[0]).toMatchObject({ id: "order", business: true });
    expect(document.diagnostics).toEqual([]);
  });
});
