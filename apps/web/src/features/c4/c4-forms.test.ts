import { describe, expect, it } from "vitest";
import { C4_ELEMENT_MACROS, parseC4 } from "../../c4-source";
import {
  addC4Include,
  c4Connectable,
  c4Containers,
  c4EditBlocker,
  c4ElementMacroName,
  c4ElementVariant,
  c4IncludedLibraries,
  c4MissingLibrary,
  c4SelectionAt,
  c4SelectionAtPosition,
  c4SelectionFromKey,
  c4SelectionKey,
  findC4AliasLine,
  suggestC4Alias,
  type C4FormElementKind,
  type C4Store,
} from "./c4-forms";

describe("element macro names", () => {
  it("round-trips every element macro the library has", () => {
    for (const name of C4_ELEMENT_MACROS) {
      const variant = c4ElementVariant(name)!;
      expect(variant, name).toBeDefined();
      expect(c4ElementMacroName(variant.kind, variant.store, variant.external)).toBe(name);
    }
  });

  it("builds the variants from kind, storage and side", () => {
    const name = (kind: C4FormElementKind, store: C4Store, external: boolean) =>
      c4ElementMacroName(kind, store, external);
    expect(name("container", "database", false)).toBe("ContainerDb");
    expect(name("system", "queue", true)).toBe("SystemQueue_Ext");
    expect(name("component", "database", true)).toBe("ComponentDb_Ext");
    expect(name("person", "database", true)).toBe("Person_Ext");
    expect(c4ElementVariant("Rel")).toBeUndefined();
    expect(c4ElementVariant("System_Boundary")).toBeUndefined();
  });
});

describe("suggestC4Alias", () => {
  it("makes an identifier from a label and keeps it unique", () => {
    expect(suggestC4Alias("Order service", [])).toBe("orderService");
    expect(suggestC4Alias("Café — API (v2)", [])).toBe("cafeAPIV2");
    expect(suggestC4Alias("Order service", ["orderService"])).toBe("orderService2");
    expect(suggestC4Alias("2nd site", [])).toBe("_2ndSite");
    expect(suggestC4Alias("   ", [])).toBe("");
  });
});

describe("includes", () => {
  const withInclude = (...names: string[]) =>
    `@startuml\n${names.map((name) => `!include <C4/${name}>`).join("\n")}\n@enduml`;

  it("counts what an included library includes itself", () => {
    expect([...c4IncludedLibraries(withInclude("C4_Component"))].sort()).toEqual([
      "C4_Component",
      "C4_Container",
      "C4_Context",
    ]);
    expect([...c4IncludedLibraries(withInclude("C4_Deployment"))].sort()).toEqual([
      "C4_Container",
      "C4_Context",
      "C4_Deployment",
    ]);
    expect(
      c4IncludedLibraries("@startuml\n!include https://example.com/C4_Dynamic.puml\n@enduml").has("C4_Component"),
    ).toBe(true);
    expect(c4IncludedLibraries('@startuml\nPerson(a, "A")\n@enduml').size).toBe(0);
  });

  it("reports the library a macro needs, only when it is missing", () => {
    expect(c4MissingLibrary(withInclude("C4_Context"), "Person")).toBeUndefined();
    expect(c4MissingLibrary(withInclude("C4_Context"), "Container")).toBe("C4_Container");
    expect(c4MissingLibrary(withInclude("C4_Container"), "Component")).toBe("C4_Component");
    expect(c4MissingLibrary(withInclude("C4_Component"), "Container")).toBeUndefined();
    expect(c4MissingLibrary(withInclude("C4_Deployment"), "Component")).toBe("C4_Component");
    expect(c4MissingLibrary("@startuml\n@enduml", "Rel")).toBe("C4_Context");
  });

  it("adds the include after the last C4 include, else after @startuml, in the file's line ending", () => {
    expect(addC4Include(withInclude("C4_Context"), "C4_Container")).toBe(withInclude("C4_Context", "C4_Container"));
    expect(addC4Include('@startuml\nPerson(a, "A")\n@enduml', "C4_Context")).toBe(
      '@startuml\n!include <C4/C4_Context>\nPerson(a, "A")\n@enduml',
    );
    expect(addC4Include("@startuml\r\n@enduml", "C4_Context")).toBe("@startuml\r\n!include <C4/C4_Context>\r\n@enduml");
    expect(addC4Include('Person(a, "A")', "C4_Context")).toBe('!include <C4/C4_Context>\nPerson(a, "A")');
  });
});

const SOURCE = `@startuml
!include <C4/C4_Container>
Person(user, "User")
System_Boundary(shop, "Shop") {
  Container(web, "Web", "React")
}
!procedure P($alias)
Container($alias, "In procedure")
!endprocedure
P(proc)
Rel(user, web, "Uses")
Rel(web, proc, "Calls")
@enduml`;

describe("selection helpers", () => {
  const document = parseC4(SOURCE);

  it("keys selections the way the canvas and the outline do", () => {
    expect(c4SelectionKey({ kind: "element", alias: "web" })).toBe("web");
    expect(c4SelectionKey({ kind: "relationship", index: 2 })).toBe("rel:2");
    expect(c4SelectionKey({ kind: "unmanaged", alias: "proc" })).toBe("proc");
    expect(c4SelectionKey({ kind: "unmanaged", from: "a", to: "b" })).toBe("link:a>b");
    expect(c4SelectionKey(undefined)).toBeUndefined();
    expect(c4SelectionFromKey("rel:3")).toEqual({ kind: "relationship", index: 3 });
    expect(c4SelectionFromKey("web")).toEqual({ kind: "element", alias: "web" });
  });

  it("finds the item an edit reports, and the item under the cursor", () => {
    const web = document.elements.find((item) => item.id === "web")!;
    expect(c4SelectionAt(document, { from: web.nameRange.from, to: web.range.to })).toEqual({
      kind: "element",
      alias: "web",
    });
    const rel = document.relationships[1]!;
    expect(c4SelectionAt(document, { from: rel.nameRange.from, to: rel.range.to })).toEqual({
      kind: "relationship",
      index: 1,
    });
    expect(c4SelectionAt(document, { from: 0, to: 0 })).toBeUndefined();
    expect(c4SelectionAtPosition(document, web.range.from + 3)).toEqual({ kind: "element", alias: "web" });
    expect(c4SelectionAtPosition(document, rel.range.from + 1)).toEqual({ kind: "relationship", index: 1 });
    expect(c4SelectionAtPosition(document, 2)).toBeUndefined();
  });

  it("finds where a procedure declares an alias", () => {
    const line = findC4AliasLine(SOURCE, "proc")!;
    expect(SOURCE.slice(line.from, line.to)).toBe("P(proc)");
    expect(findC4AliasLine(SOURCE, "missing")).toBeUndefined();
  });

  it("says why a call can't be edited in a form", () => {
    expect(c4EditBlocker(document.elements.find((item) => item.id === "web")!)).toBeUndefined();
    expect(c4EditBlocker(document.elements.find((item) => item.id === "$alias")!)).toContain("!procedure");
    expect(c4EditBlocker(parseC4('Rel(a, b, "x")\nRelIndex(1, a, b, "y")').relationships[1]!)).toContain("RelIndex");
  });

  it("lists what a relationship can connect and what can hold elements", () => {
    expect(c4Connectable(document).map((item) => item.id)).toEqual(["user", "web", "$alias"]);
    expect(c4Containers(document).map((item) => item.id)).toEqual(["shop"]);
  });
});
