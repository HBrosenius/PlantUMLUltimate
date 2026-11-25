import { describe, expect, it } from "vitest";
import { C4_MACROS, c4Macro, isC4Source, parseC4, parseC4ArgumentSpans, parseC4Arguments } from "./index";

const SOURCE = `@startuml
!include <C4/C4_Container>
LAYOUT_LEFT_RIGHT()
LAYOUT_WITH_LEGEND()
AddElementTag("v1", $bgColor="#ff0000")
AddRelTag("slow", $lineColor="red")
Person(user, "Customer", "Buys things", $tags="v1")
System_Boundary(shop, "Web shop") { ' the shop
  Container(web, "Web app", "React", "The UI", $sprite="react", $link="https://x.test")
  ContainerDb(db, "Database", "PostgreSQL")
}
System_Ext(mail, "Mail")
Rel(user, web, "Uses (really)", "HTTPS") ' a comment (with a paren)
Rel_R(web, db, "Reads, and writes")
Lay_D(user, mail)
SHOW_LEGEND()
@enduml`;

describe("C4 arguments", () => {
  it("reads arguments with quoted commas, nested calls and named parameters", () => {
    expect(parseC4Arguments('web, "Reads, and writes", $techn="SQL", f(a, b)')).toEqual([
      { value: "web" },
      { value: "Reads, and writes" },
      { name: "techn", value: "SQL" },
      { value: "f(a, b)" },
    ]);
  });

  it("says where each argument and its value are written", () => {
    const text = ' web , "Reads, it" ,$techn = "SQL"';
    const spans = parseC4ArgumentSpans(text, 100);
    expect(spans.map((item) => [item.name, item.value, item.form, item.raw])).toEqual([
      [undefined, "web", "bare", "web"],
      [undefined, "Reads, it", "quoted", '"Reads, it"'],
      ["techn", "SQL", "quoted", '$techn = "SQL"'],
    ]);
    for (const span of spans) {
      expect(text.slice(span.range.from - 100, span.range.to - 100)).toBe(span.raw);
      expect(text.slice(span.valueRange.from - 100, span.valueRange.to - 100)).toBe(span.value);
    }
  });

  it("marks concatenations and calls as expressions, and keeps an escaped quote inside a literal", () => {
    const spans = parseC4ArgumentSpans('"a" + $b, f(x), "say \\"hi\\""');
    expect(spans.map((item) => item.form)).toEqual(["expression", "expression", "quoted"]);
  });

  it("reads an empty list, and a trailing empty argument", () => {
    expect(parseC4ArgumentSpans("")).toEqual([]);
    expect(parseC4Arguments("a,")).toEqual([{ value: "a" }, { value: "" }]);
  });
});

describe("C4 parser", () => {
  const document = parseC4(SOURCE);

  it("reads elements and relationships with their positions", () => {
    expect(document.elements.map((item) => [item.id, item.macro, item.parent, item.index, item.depth])).toEqual([
      ["user", "Person", undefined, 0, 0],
      ["shop", "System_Boundary", undefined, 1, 0],
      ["web", "Container", "shop", 2, 1],
      ["db", "ContainerDb", "shop", 3, 1],
      ["mail", "System_Ext", undefined, 4, 0],
    ]);
    expect(document.relationships.map((item) => [item.index, item.from, item.to, item.macro, item.technology])).toEqual(
      [
        [0, "user", "web", "Rel", "HTTPS"],
        [1, "web", "db", "Rel_R", undefined],
      ],
    );
  });

  it("keeps the label that has parentheses, and ignores a comment after the call", () => {
    expect(document.relationships[0]).toMatchObject({ label: "Uses (really)" });
    expect(document.relationships[0]!.arguments).toHaveLength(4);
  });

  it("knows each boundary's open and close lines", () => {
    const shop = document.elements.find((item) => item.id === "shop")!;
    expect(shop).toMatchObject({ line: 8, closeLine: 11, blockOpen: true });
    expect(SOURCE.slice(shop.closeRange!.from, shop.closeRange!.to)).toBe("}");
    expect(document.elements.find((item) => item.id === "web")).toMatchObject({ blockOpen: false });
    expect(document.elements.find((item) => item.id === "web")!.closeLine).toBeUndefined();
  });

  it("gives the span of every argument, and the named ones", () => {
    const web = document.elements.find((item) => item.id === "web")!;
    expect(web.arguments.map((item) => [item.name, item.value])).toEqual([
      [undefined, "web"],
      [undefined, "Web app"],
      [undefined, "React"],
      [undefined, "The UI"],
      ["sprite", "react"],
      ["link", "https://x.test"],
    ]);
    expect(SOURCE.slice(web.nameRange.from, web.nameRange.to)).toBe("Container");
    for (const argument of web.arguments)
      expect(SOURCE.slice(argument.valueRange.from, argument.valueRange.to)).toBe(argument.value);
  });

  it("reads the diagram's settings", () => {
    expect(document.settings.layout.map((item) => item.macro)).toEqual(["LAYOUT_LEFT_RIGHT"]);
    expect(document.settings.legend.map((item) => item.macro)).toEqual(["LAYOUT_WITH_LEGEND", "SHOW_LEGEND"]);
    expect(document.settings.hints.map((item) => [item.macro, item.from, item.to])).toEqual([
      ["Lay_D", "user", "mail"],
    ]);
    expect(document.settings.tags.map((item) => [item.kind, item.tag, item.macro])).toEqual([
      ["element", "v1", "AddElementTag"],
      ["relationship", "slow", "AddRelTag"],
    ]);
  });

  it("flags lines that sit in a conditional, a procedure, a function or a loop", () => {
    const parsed = parseC4(`@startuml
!if %true()
Container(a, "A")
!else
Container(b, "B")
!endif
!procedure Svc($a)
Container($a, "S")
!endprocedure
!function $f()
!endfunction
!foreach $x in "a,b"
Container(c, "C")
!endfor
Container(plain, "P")
@enduml`);
    expect(parsed.elements.map((item) => [item.id, item.scope])).toEqual([
      ["a", "if"],
      ["b", "if"],
      ["$a", "procedure"],
      ["c", "loop"],
      ["plain", undefined],
    ]);
  });

  it("reads Windows line endings and a boundary that is never closed", () => {
    const parsed = parseC4('Container_Boundary(a, "A") {\r\n  Component(b, "B")\r\n');
    expect(parsed.elements.map((item) => [item.id, item.parent, item.closeLine])).toEqual([
      ["a", undefined, undefined],
      ["b", "a", undefined],
    ]);
    expect(parsed.elements[1]!.range).toEqual({ from: 30, to: 49 });
  });

  it("ignores unknown macros and comments", () => {
    const parsed = parseC4(`Foo(bar, "x")\n' Container(c, "no")\n/'\nContainer(d, "no")\n'/\nContainer(e, "yes")`);
    expect(parsed.elements.map((item) => item.id)).toEqual(["e"]);
  });
});

describe("C4 detection", () => {
  it("detects the include and the macros", () => {
    expect(isC4Source("!include <C4/C4_Context>")).toBe(true);
    expect(isC4Source('Container(web, "Web", "React")')).toBe(true);
    expect(isC4Source("Rel(a, b, 'x')")).toBe(false);
    expect(c4Macro("container")?.name).toBe("Container");
    expect(C4_MACROS.length).toBeGreaterThan(50);
  });
});
