import { describe, expect, it } from "vitest";
import { parseUseCase } from "./parser";

describe("parseUseCase", () => {
  it("rejects oversized input before applying grammar expressions", () => {
    expect(() => parseUseCase(" ".repeat(100_001))).toThrow(/100,000 character limit/);
  });

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

  it("parses compact and multiline floating notes without treating their bodies as unknown source", () => {
    const document = parseUseCase(`@startuml
note "Short reminder" as Short #Yellow
note as Detail #LightBlue
First line
Second line
end note
@enduml`);
    expect(document.notes).toMatchObject([
      { alias: "Short", text: "Short reminder", color: "#Yellow", targetIds: [] },
      { alias: "Detail", text: "First line\nSecond line", color: "#LightBlue", targetIds: [] },
    ]);
    expect(document.unknown).toEqual([]);
    expect(document.diagnostics).toEqual([]);
  });

  it("parses a mixed real-world diagram while preserving unsupported presentation directives", () => {
    const document = parseUseCase(`@startuml
title Customer portal
skinparam packageStyle rectangle
actor "Registered customer" as Customer <<Person>> #LightBlue
rectangle "Customer portal" as Portal #F8F8F8 {
  (Browse catalog) as Browse
  usecase/ "Place order" as Order <<Core>> #LightGreen
}
Customer -right-> Browse : searches
Customer --> Order
Order .up.> Browse : <<extend>>
note bottom of Order
Requires an authenticated customer
and an available payment method.
end note
footer Internal model
@enduml`);
    expect(document.elements).toHaveLength(3);
    expect(document.packages).toMatchObject([{ id: "portal", kind: "rectangle" }]);
    expect(document.relationships).toMatchObject([
      { from: "customer", to: "browse", direction: "right", kind: "association" },
      { from: "customer", to: "order", kind: "association" },
      { from: "order", to: "browse", direction: "up", kind: "extend" },
    ]);
    expect(document.notes[0]?.text).toContain("available payment method");
    expect(document.unknown).toEqual([]);
    expect(document.diagnostics).toEqual([]);
  });

  it("handles large diagrams without losing object identity", () => {
    const declarations = Array.from({ length: 250 }, (_, index) => `usecase "Capability ${index}" as U${index}`);
    const relationships = Array.from({ length: 249 }, (_, index) => `U${index} --> U${index + 1}`);
    const document = parseUseCase(["@startuml", ...declarations, ...relationships, "@enduml"].join("\n"));
    expect(document.useCases).toHaveLength(250);
    expect(document.relationships).toHaveLength(249);
    expect(document.useCases[249]?.id).toBe("u249");
    expect(document.diagnostics).toEqual([]);
  });
});
