import { describe, expect, it } from "vitest";
import { parseUseCase } from "./parser";

describe("parseUseCase", () => {
  it("parses multiline descriptions with the identifier before the quoted label", () => {
    const label = `You can use
several lines to define your usecase.
You can also use separators.
--
Several separators are possible.
==
And you can add titles:
..Conclusion..
This allows large description.`;
    for (const declaration of [`usecase UC1 as "${label}"`, `usecase "${label}" as UC1`]) {
      const source = `@startuml\n\n${declaration}\n\nUC1 --> (Other)\n@enduml`;
      const document = parseUseCase(source);
      expect(document.diagnostics).toEqual([]);
      expect(document.unknown).toEqual([]);
      expect(document.useCases[0]).toMatchObject({ id: "uc1", alias: "UC1", label });
      const range = document.useCases[0]!.sourceRange;
      expect(source.slice(range.from, range.to)).toBe(declaration);
      expect(document.relationships[0]?.from).toBe("uc1");
      expect(parseUseCase(source.replaceAll("\n", "\r\n")).useCases[0]?.label).toBe(label);
    }
  });

  it("keeps skinparam braces separate from package braces", () => {
    const document = parseUseCase(`@startuml
!option handwritten true

skinparam usecase {
BackgroundColor DarkSeaGreen
BorderColor DarkSlateGray

BackgroundColor<< Main >> YellowGreen
BorderColor<< Main >> YellowGreen

ArrowColor Olive
ActorBorderColor black
ActorFontName Courier

ActorBackgroundColor<< Human >> Gold
}

User << Human >>
:Main Database: as MySql << Application >>
(Start) << One Shot >>
(Use the application) as (Use) << Main >>

User -> (Start)
User --> (Use)

MySql --> (Use)

@enduml`);
    expect(document.diagnostics).toEqual([]);
    expect(document.packages).toEqual([]);
    expect(document.actors).toContainEqual(expect.objectContaining({ id: "user", stereotype: "Human" }));
    expect(document.elements).toHaveLength(4);
    expect(document.relationships).toHaveLength(3);
    expect(document.unknown.map((item) => item.text)).toEqual(["!option handwritten true"]);

    const nested = parseUseCase(`@startuml
package System {
skinparam usecase {
  BackgroundColor Green
}
(Use)
}
}
@enduml`);
    expect(nested.useCases[0]?.packageId).toBe("system");
    expect(nested.diagnostics.map((item) => item.code)).toEqual(["unexpected-package-end"]);
    expect(nested.packages[0]?.closeRange.from).toBe(nested.packages[0]?.sourceRange.to! - 1);
  });

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

  it("infers actors and use cases from quoted declarations with aliases", () => {
    const document = parseUseCase(`@startuml
skinparam actorStyle awesome
:User: --> (Use)
"Main Admin" as Admin
"Use the application" as (Use)
Admin --> (Admin the application)
@enduml`);
    expect(document.diagnostics).toEqual([]);
    expect(document.unknown).toEqual([]);
    expect(document.actors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "admin", alias: "Admin", label: "Main Admin" }),
        expect.objectContaining({ id: "user", implicit: true }),
      ]),
    );
    expect(document.useCases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "use", alias: "Use", label: "Use the application" }),
        expect.objectContaining({ id: "admin the application", implicit: true }),
      ]),
    );
    expect(document.elements).toHaveLength(4);
    expect(document.relationships).toMatchObject([
      { from: "user", to: "use" },
      { from: "admin", to: "admin the application" },
    ]);
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

describe("parseUseCase line endings", () => {
  it("parses CRLF sources like LF sources", () => {
    const source = "@startuml\nactor User\nusecase Login\nUser --> Login : signs in\n@enduml\n";
    const lf = parseUseCase(source);
    const crlf = parseUseCase(source.replace(/\n/g, "\r\n"));
    expect(crlf.relationships).toHaveLength(1);
    expect(crlf.relationships[0]?.label).toBe(lf.relationships[0]?.label);
    expect(lf.relationships[0]?.label).toBeTruthy();
    expect(crlf.elements.map((element) => element.label)).toEqual(lf.elements.map((element) => element.label));
    expect(crlf.unknown).toEqual([]);
  });
});

describe("parseUseCase shorthand relationships", () => {
  it("supports implicit bare actors and relationships to floating notes", () => {
    const document = parseUseCase(`@startuml
:Main Admin: as Admin
(Use the application) as (Use)

User -> (Start)
User --> (Use)

Admin ---> (Use)

note right of Admin : This is an example.

note right of (Use)
  A note can also
  be on several lines
end note

note "This note is connected\\nto several objects." as N2
(Start) .. N2
N2 .. (Use)
@enduml`);
    expect(document.diagnostics).toEqual([]);
    expect(document.unknown).toEqual([]);
    expect(document.actors).toHaveLength(2);
    expect(document.actors).toContainEqual(expect.objectContaining({ id: "user", label: "User", implicit: true }));
    expect(document.useCases).toHaveLength(2);
    expect(document.elements.some((element) => element.id === "n2")).toBe(false);
    expect(document.relationships).toHaveLength(5);
    expect(document.relationships.slice(-2)).toMatchObject([
      { from: "start", to: "n2" },
      { from: "n2", to: "use" },
    ]);
    expect(document.notes).toHaveLength(3);
    expect(document.notes[1]).toMatchObject({ targetIds: ["use"], text: "A note can also\n  be on several lines" });
  });

  it("reads shorthand actor and use-case endpoints as relationships", () => {
    const document = parseUseCase("@startuml\n:User: --> (Login)\n(Login) .> (Verify) : <<include>>\n@enduml");
    expect(document.relationships).toHaveLength(2);
    expect(document.relationships[1]?.kind).toBe("include");
    expect(document.diagnostics).toEqual([]);
  });
});
