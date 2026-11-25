import { describe, expect, it } from "vitest";
import {
  addC4Boundary,
  addC4Element,
  addC4Relationship,
  changeC4ElementMacro,
  collectC4SymbolOccurrences,
  findC4References,
  moveC4Element,
  removeC4Element,
  removeC4Relationship,
  renameC4Alias,
  reorderC4Element,
  reverseC4Relationship,
  setC4RelationshipDirection,
  setC4RelationshipMacro,
  setC4Settings,
  updateC4Argument,
  validateC4Alias,
  validateC4Rename,
  type C4EditResult,
} from "./index";

const SOURCE = `@startuml
!include <C4/C4_Container>

title Shop

Person(user, "Customer", "Buys things")
System_Boundary(shop, "Web shop") {
  Container(web, "Web app", "React", "The UI")
  ContainerDb(db, "Database", "PostgreSQL")
}
System_Ext(mail, "Mail")

Rel(user, web, "Uses", "HTTPS")
Rel(web, db, "Reads, and writes")
Rel_R(web, mail, "Sends")
Lay_R(user, shop)
SHOW_LEGEND()
@enduml`;

/** The lines that differ: what was removed and what was added, with the unchanged start and end cut off. */
function changed(before: string, after: string) {
  const a = before.split("\n");
  const b = after.split("\n");
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a.at(-1 - end) === b.at(-1 - end)) end += 1;
  return { removed: a.slice(start, a.length - end), added: b.slice(start, b.length - end) };
}

function ok(result: C4EditResult) {
  if (!result.ok) throw new Error(`refused: ${result.message}`);
  return result;
}
const refusal = (result: C4EditResult) => {
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.message;
};
const selected = (result: C4EditResult) =>
  result.ok ? result.source.slice(result.selection.from, result.selection.to) : "";

describe("adding elements", () => {
  it("adds a top-level element after the last top-level declaration", () => {
    const result = ok(
      addC4Element(SOURCE, { macro: "System", alias: "pay", label: "Payments", description: "Takes cards" }),
    );
    expect(changed(SOURCE, result.source)).toEqual({
      removed: [],
      added: ['System(pay, "Payments", "Takes cards")'],
    });
    expect(result.source.split("\n")[11]).toBe('System(pay, "Payments", "Takes cards")');
    expect(selected(result)).toBe('System(pay, "Payments", "Takes cards")');
  });

  it("adds an element inside a boundary with the boundary's indentation", () => {
    const result = ok(
      addC4Element(SOURCE, {
        macro: "ContainerQueue_Ext",
        alias: "mq",
        label: "Queue",
        technology: "Kafka",
        parent: "shop",
      }),
    );
    expect(changed(SOURCE, result.source)).toEqual({
      removed: [],
      added: ['  ContainerQueue_Ext(mq, "Queue", "Kafka")'],
    });
    expect(selected(result)).toBe('ContainerQueue_Ext(mq, "Queue", "Kafka")');
  });

  it("writes tags, link and sprite by name, and pads skipped optional arguments", () => {
    const result = ok(
      addC4Element(SOURCE, {
        macro: "Container",
        alias: "api",
        label: "API",
        description: "Orders",
        tags: "v1",
        sprite: "java",
      }),
    );
    expect(changed(SOURCE, result.source).added).toEqual([
      'Container(api, "API", "", "Orders", $sprite="java", $tags="v1")',
    ]);
  });

  it("uses a tab when the file indents with tabs", () => {
    const source = SOURCE.replace(/^ {2}/gm, "\t");
    const result = ok(addC4Element(source, { macro: "Container", alias: "x", label: "X", parent: "shop" }));
    expect(changed(source, result.source).added).toEqual(['\tContainer(x, "X")']);
  });

  it("keeps Windows line endings", () => {
    const source = SOURCE.replaceAll("\n", "\r\n");
    const result = ok(addC4Element(source, { macro: "Person", alias: "ops", label: "Operator" }));
    expect(result.source.replaceAll("\r\n", "")).not.toContain("\n");
    expect(result.source.split("\r\n")[11]).toBe('Person(ops, "Operator")');
    expect(result.source.replaceAll("\r\n", "\n")).toBe(
      ok(addC4Element(SOURCE, { macro: "Person", alias: "ops", label: "Operator" })).source,
    );
  });

  it("adds to an empty diagram before @enduml, and to a source without @enduml", () => {
    expect(ok(addC4Element("@startuml\n@enduml", { macro: "Person", alias: "a", label: "A" })).source).toBe(
      '@startuml\nPerson(a, "A")\n@enduml',
    );
    expect(ok(addC4Element('Person(a, "A")', { macro: "Person", alias: "b", label: "B" })).source).toBe(
      'Person(a, "A")\nPerson(b, "B")',
    );
  });

  it("refuses what it cannot write safely", () => {
    expect(refusal(addC4Element(SOURCE, { macro: "Container", alias: "a.b", label: "X" }))).toMatch(/dot/);
    expect(refusal(addC4Element(SOURCE, { macro: "Container", alias: "web", label: "X" }))).toBe(
      "Alias “web” is already used",
    );
    expect(refusal(addC4Element(SOURCE, { macro: "Container", alias: "1x", label: "X" }))).toMatch(/letters, digits/);
    expect(refusal(addC4Element(SOURCE, { macro: "Container", alias: "x", label: 'He said "hi"' }))).toMatch(
      /double quote/,
    );
    expect(refusal(addC4Element(SOURCE, { macro: "Container", alias: "x", label: "path\\" }))).toMatch(/backslash/);
    expect(refusal(addC4Element(SOURCE, { macro: "Rel", alias: "x", label: "X" }))).toMatch(/not an element macro/);
    expect(refusal(addC4Element(SOURCE, { macro: "Person", alias: "x", label: "X", technology: "T" }))).toMatch(
      /no technology/,
    );
    expect(refusal(addC4Element(SOURCE, { macro: "Person", alias: "x", label: "X", parent: "nobody" }))).toMatch(
      /isn't declared/,
    );
    expect(refusal(addC4Element(SOURCE, { macro: "Person", alias: "x", label: "X", parent: "web" }))).toMatch(
      /not a boundary/,
    );
  });

  it("writes a line break in a label as \\n", () => {
    const result = ok(addC4Element(SOURCE, { macro: "Person", alias: "x", label: "Two\nlines" }));
    expect(changed(SOURCE, result.source).added).toEqual(['Person(x, "Two\\nlines")']);
  });
});

describe("adding boundaries", () => {
  it("adds a boundary with its closing brace, and a node with its type", () => {
    const boundary = ok(addC4Boundary(SOURCE, { macro: "Enterprise_Boundary", alias: "corp", label: "Corp" }));
    expect(changed(SOURCE, boundary.source).added).toEqual(['Enterprise_Boundary(corp, "Corp") {', "}"]);
    const node = ok(
      addC4Boundary(SOURCE, { macro: "Deployment_Node", alias: "n", label: "Server", technology: "Linux" }),
    );
    expect(changed(SOURCE, node.source).added).toEqual(['Deployment_Node(n, "Server", "Linux") {', "}"]);
  });

  it("adds a boundary inside a boundary", () => {
    const result = ok(
      addC4Boundary(SOURCE, { macro: "Container_Boundary", alias: "inner", label: "Inner", parent: "shop" }),
    );
    expect(changed(SOURCE, result.source).added).toEqual(['  Container_Boundary(inner, "Inner") {', "  }"]);
    expect(selected(result)).toBe('Container_Boundary(inner, "Inner") {');
  });

  it("refuses a macro that is not a boundary", () => {
    expect(refusal(addC4Boundary(SOURCE, { macro: "Container", alias: "x", label: "X" }))).toMatch(/not a boundary/);
  });
});

describe("adding relationships", () => {
  it("adds after the last relationship", () => {
    const result = ok(addC4Relationship(SOURCE, { from: "user", to: "mail", label: "Emails", technology: "SMTP" }));
    expect(changed(SOURCE, result.source)).toEqual({ removed: [], added: ['Rel(user, mail, "Emails", "SMTP")'] });
    expect(result.source.split("\n")[15]).toBe('Rel(user, mail, "Emails", "SMTP")');
    expect(selected(result)).toBe('Rel(user, mail, "Emails", "SMTP")');
  });

  it("writes every direction and the bidirectional form", () => {
    for (const macro of [
      "BiRel",
      "Rel_U",
      "Rel_D",
      "Rel_L",
      "Rel_R",
      "Rel_Back",
      "Rel_Up",
      "Rel_Down",
      "Rel_Left",
      "Rel_Right",
    ]) {
      const result = ok(addC4Relationship(SOURCE, { macro, from: "web", to: "db", label: "x" }));
      expect(changed(SOURCE, result.source).added).toEqual([`${macro}(web, db, "x")`]);
    }
  });

  it("adds before the closing lines when there are no relationships", () => {
    const source = '@startuml\nPerson(a, "A")\nSystem(b, "B")\nSHOW_LEGEND()\n@enduml';
    expect(ok(addC4Relationship(source, { from: "a", to: "b", label: "uses" })).source).toBe(
      '@startuml\nPerson(a, "A")\nSystem(b, "B")\nRel(a, b, "uses")\nSHOW_LEGEND()\n@enduml',
    );
  });

  it("refuses unknown ends, boundaries and the dynamic macro", () => {
    expect(refusal(addC4Relationship(SOURCE, { from: "ghost", to: "web", label: "x" }))).toMatch(
      /source “ghost” isn't declared/,
    );
    expect(refusal(addC4Relationship(SOURCE, { from: "web", to: "shop", label: "x" }))).toMatch(/boundary or node/);
    expect(refusal(addC4Relationship(SOURCE, { macro: "RelIndex", from: "web", to: "db", label: "x" }))).toMatch(
      /not a relationship macro/,
    );
    expect(refusal(addC4Relationship(SOURCE, { from: "web", to: "db", label: 'a "b"' }))).toMatch(/double quote/);
  });
});

describe("updating one argument", () => {
  it("changes a quoted value and leaves the rest of the line alone", () => {
    const result = ok(updateC4Argument(SOURCE, { kind: "element", alias: "web" }, "label", "Storefront"));
    expect(changed(SOURCE, result.source)).toEqual({
      removed: ['  Container(web, "Web app", "React", "The UI")'],
      added: ['  Container(web, "Storefront", "React", "The UI")'],
    });
    expect(selected(result)).toBe('Container(web, "Storefront", "React", "The UI")');
  });

  it("keeps odd spacing, bare values and trailing comments byte for byte", () => {
    const source = 'Container( web ,"Web"  ,  React ,"d" ) \' note: (x)\nRel(web,web,"r")';
    const result = ok(updateC4Argument(source, { kind: "element", alias: "web" }, "techn", "Vue"));
    expect(result.source).toBe('Container( web ,"Web"  ,  Vue ,"d" ) \' note: (x)\nRel(web,web,"r")');
    const quoted = ok(updateC4Argument(source, { kind: "element", alias: "web" }, "techn", "Vue 3"));
    expect(quoted.source).toBe('Container( web ,"Web"  ,  "Vue 3" ,"d" ) \' note: (x)\nRel(web,web,"r")');
  });

  it("adds the next optional argument by position, padding what is skipped", () => {
    const source = 'Container(a, "A")\nRel(a, a, "x")';
    expect(ok(updateC4Argument(source, { kind: "element", alias: "a" }, "technology", "Java")).source).toBe(
      'Container(a, "A", "Java")\nRel(a, a, "x")',
    );
    expect(ok(updateC4Argument(source, { kind: "element", alias: "a" }, "descr", "Does it")).source).toBe(
      'Container(a, "A", "", "Does it")\nRel(a, a, "x")',
    );
    expect(ok(updateC4Argument(source, { kind: "relationship", index: 0 }, "techn", "SQL")).source).toBe(
      'Container(a, "A")\nRel(a, a, "x", "SQL")',
    );
  });

  it("adds named arguments at the end, and keeps the separator style", () => {
    const source = 'Container(a,"A")';
    expect(ok(updateC4Argument(source, { kind: "element", alias: "a" }, "tags", "v1")).source).toBe(
      'Container(a,"A",$tags="v1")',
    );
    const withTag = 'Container(a, "A", "T", $tags="v1")';
    expect(ok(updateC4Argument(withTag, { kind: "element", alias: "a" }, "link", "https://x.test")).source).toBe(
      'Container(a, "A", "T", $tags="v1", $link="https://x.test")',
    );
    expect(ok(updateC4Argument(withTag, { kind: "element", alias: "a" }, "descr", "D")).source).toBe(
      'Container(a, "A", "T", "D", $tags="v1")',
    );
  });

  it("removes a named argument, a last positional one, and blanks one in the middle", () => {
    const source = 'Container(a, "A", "T", "D", $tags="v1", $link="l")';
    expect(ok(updateC4Argument(source, { kind: "element", alias: "a" }, "tags", undefined)).source).toBe(
      'Container(a, "A", "T", "D", $link="l")',
    );
    expect(
      ok(updateC4Argument('Container(a, "A", "T", "D")', { kind: "element", alias: "a" }, "descr", "")).source,
    ).toBe('Container(a, "A", "T")');
    expect(
      ok(updateC4Argument('Container(a, "A", "T", "D")', { kind: "element", alias: "a" }, "techn", "")).source,
    ).toBe('Container(a, "A", "", "D")');
    expect(ok(updateC4Argument('Container(a, "A", "T")', { kind: "element", alias: "a" }, "techn", "")).source).toBe(
      'Container(a, "A")',
    );
  });

  it("changes a named argument's value only", () => {
    const source = 'Container(a, "A", $tags="v1", $link="l")';
    expect(ok(updateC4Argument(source, { kind: "element", alias: "a" }, "tags", "v2")).source).toBe(
      'Container(a, "A", $tags="v2", $link="l")',
    );
  });

  it("updates a relationship by its index in source order", () => {
    const result = ok(updateC4Argument(SOURCE, { kind: "relationship", index: 1 }, "label", "Queries"));
    expect(changed(SOURCE, result.source)).toEqual({
      removed: ['Rel(web, db, "Reads, and writes")'],
      added: ['Rel(web, db, "Queries")'],
    });
    expect(selected(result)).toBe('Rel(web, db, "Queries")');
  });

  it("re-points a relationship end to a declared element", () => {
    const result = ok(updateC4Argument(SOURCE, { kind: "relationship", index: 0 }, "to", "db"));
    expect(changed(SOURCE, result.source).added).toEqual(['Rel(user, db, "Uses", "HTTPS")']);
    expect(refusal(updateC4Argument(SOURCE, { kind: "relationship", index: 0 }, "to", "ghost"))).toMatch(
      /isn't declared/,
    );
    expect(refusal(updateC4Argument(SOURCE, { kind: "relationship", index: 0 }, "to", "shop"))).toMatch(
      /boundary or node/,
    );
  });

  it("changes a boundary's type argument", () => {
    const source = 'Boundary(b, "B", "region") {\n}';
    expect(ok(updateC4Argument(source, { kind: "element", alias: "b" }, "technology", "zone")).source).toBe(
      'Boundary(b, "B", "zone") {\n}',
    );
  });

  it("is a no-op when the value does not change", () => {
    const result = ok(updateC4Argument(SOURCE, { kind: "element", alias: "web" }, "techn", "React"));
    expect(result.source).toBe(SOURCE);
    expect(selected(result)).toBe('Container(web, "Web app", "React", "The UI")');
  });

  it("refuses a bad value, an expression, the alias and an unknown parameter", () => {
    const target = { kind: "element", alias: "web" } as const;
    expect(refusal(updateC4Argument(SOURCE, target, "label", 'a "b"'))).toMatch(/double quote/);
    expect(refusal(updateC4Argument(SOURCE, target, "alias", "x"))).toMatch(/rename/i);
    expect(refusal(updateC4Argument(SOURCE, target, "from", "x"))).toMatch(/no “from” argument/);
    expect(refusal(updateC4Argument('Container(a, "A" + $b)', { kind: "element", alias: "a" }, "label", "x"))).toMatch(
      /expression/,
    );
    expect(ok(updateC4Argument(SOURCE, target, "label", undefined)).source).toContain(
      'Container(web, "", "React", "The UI")',
    );
  });
});

describe("refusing unsafe places", () => {
  const CONDITIONAL = `@startuml
!include <C4/C4_Container>
!if %true()
Container(a, "A")
Container(b, "B")
Rel(a, b, "x")
!endif
!procedure Svc($n)
Container($n, "S")
!endprocedure
Container(c, "C")
@enduml`;

  it("refuses edits to elements and relationships inside !if, !procedure and !function", () => {
    expect(refusal(updateC4Argument(CONDITIONAL, { kind: "element", alias: "a" }, "label", "x"))).toBe(
      "Line 4 is inside an !if block, so it can't be edited here. Change the source instead.",
    );
    expect(refusal(updateC4Argument(CONDITIONAL, { kind: "relationship", index: 0 }, "label", "y"))).toMatch(
      /Line 6 is inside an !if block/,
    );
    expect(refusal(removeC4Element(CONDITIONAL, "a"))).toMatch(/inside an !if block/);
    expect(refusal(removeC4Relationship(CONDITIONAL, 0))).toMatch(/inside an !if block/);
    expect(refusal(renameC4Alias(CONDITIONAL, "a", "z"))).toMatch(/inside an !if block/);
    expect(refusal(changeC4ElementMacro(CONDITIONAL, "a", "System"))).toMatch(/inside an !if block/);
    expect(refusal(updateC4Argument(CONDITIONAL, { kind: "element", alias: "$n" }, "label", "x"))).toMatch(
      /inside a !procedure/,
    );
    expect(refusal(moveC4Element(CONDITIONAL, "a", undefined))).toMatch(/inside an !if block/);
  });

  it("still edits the plain lines of the same source", () => {
    const result = ok(updateC4Argument(CONDITIONAL, { kind: "element", alias: "c" }, "label", "See"));
    expect(changed(CONDITIONAL, result.source).added).toEqual(['Container(c, "See")']);
  });

  it("does not add into a conditional: new lines go after the last plain declaration", () => {
    const result = ok(addC4Element(CONDITIONAL, { macro: "Person", alias: "p", label: "P" }));
    expect(result.source.split("\n")[11]).toBe('Person(p, "P")');
  });

  it("refuses an element that is not declared in the source, such as one from an include", () => {
    expect(refusal(updateC4Argument(SOURCE, { kind: "element", alias: "fromInclude" }, "label", "x"))).toBe(
      "“fromInclude” isn't declared in this source. If it comes from an included file, edit it there.",
    );
    expect(refusal(removeC4Element(SOURCE, "fromInclude"))).toMatch(/isn't declared in this source/);
    expect(refusal(renameC4Alias(SOURCE, "fromInclude", "x"))).toMatch(/isn't declared in this source/);
  });

  it("refuses an alias that is declared twice", () => {
    const source = '!if %true()\nContainer(a, "A")\n!else\nContainer(a, "B")\n!endif\n';
    expect(refusal(updateC4Argument(source, { kind: "element", alias: "a" }, "label", "x"))).toMatch(
      /declared more than once/,
    );
  });

  it("refuses to edit a dynamic relationship in a form", () => {
    const source = '!include <C4/C4_Dynamic>\nContainer(a, "A")\nContainer(b, "B")\nRelIndex(1, a, b, "x")';
    expect(refusal(updateC4Argument(source, { kind: "relationship", index: 0 }, "label", "y"))).toMatch(/RelIndex/);
  });

  it("refuses a missing relationship", () => {
    expect(refusal(removeC4Relationship(SOURCE, 9))).toBe("There is no relationship number 10 in this source.");
  });
});

describe("changing an element's macro", () => {
  it("changes the macro name and keeps the arguments", () => {
    const result = ok(changeC4ElementMacro(SOURCE, "web", "ContainerDb"));
    expect(changed(SOURCE, result.source)).toEqual({
      removed: ['  Container(web, "Web app", "React", "The UI")'],
      added: ['  ContainerDb(web, "Web app", "React", "The UI")'],
    });
    expect(ok(changeC4ElementMacro(SOURCE, "mail", "System")).source).toContain('System(mail, "Mail")');
    expect(ok(changeC4ElementMacro(SOURCE, "user", "Person_Ext")).source).toContain(
      'Person_Ext(user, "Customer", "Buys things")',
    );
  });

  it("changes a boundary's kind when its arguments mean the same", () => {
    const source = 'System_Boundary(a, "A") {\n}';
    expect(ok(changeC4ElementMacro(source, "a", "Enterprise_Boundary")).source).toBe(
      'Enterprise_Boundary(a, "A") {\n}',
    );
  });

  it("is a no-op for the same macro", () => {
    expect(ok(changeC4ElementMacro(SOURCE, "web", "Container")).source).toBe(SOURCE);
  });

  it("refuses a macro whose arguments mean something else, and a block turned into a leaf", () => {
    expect(refusal(changeC4ElementMacro(SOURCE, "web", "System"))).toMatch(/reads its arguments differently/);
    expect(refusal(changeC4ElementMacro(SOURCE, "shop", "Container"))).toMatch(/one has contents/);
    expect(refusal(changeC4ElementMacro(SOURCE, "web", "Rel"))).toMatch(/not a macro an element can be changed to/);
  });
});

describe("changing a relationship's macro", () => {
  it("changes the direction macro only", () => {
    const result = ok(setC4RelationshipDirection(SOURCE, 0, "right"));
    expect(changed(SOURCE, result.source)).toEqual({
      removed: ['Rel(user, web, "Uses", "HTTPS")'],
      added: ['Rel_R(user, web, "Uses", "HTTPS")'],
    });
    expect(ok(setC4RelationshipDirection(SOURCE, 2, "auto")).source).toContain('Rel(web, mail, "Sends")');
    expect(ok(setC4RelationshipDirection(SOURCE, 2, "up")).source).toContain('Rel_U(web, mail, "Sends")');
    expect(ok(setC4RelationshipDirection(SOURCE, 0, "back")).source).toContain("Rel_Back(user, web");
  });

  it("keeps the long form and the bidirectional form", () => {
    const source = 'Container(a, "A")\nContainer(b, "B")\nBiRel_Up(a, b, "x")\nBiRel(b, a, "y")';
    expect(ok(setC4RelationshipDirection(source, 0, "left")).source).toContain('BiRel_Left(a, b, "x")');
    expect(ok(setC4RelationshipDirection(source, 1, "down")).source).toContain('BiRel_D(b, a, "y")');
    expect(refusal(setC4RelationshipDirection(source, 1, "back"))).toMatch(/no back direction/);
  });

  it("changes Rel to BiRel", () => {
    expect(ok(setC4RelationshipMacro(SOURCE, 1, "BiRel")).source).toContain('BiRel(web, db, "Reads, and writes")');
    expect(refusal(setC4RelationshipMacro(SOURCE, 1, "Container"))).toMatch(/not a relationship macro/);
  });
});

describe("reversing a relationship", () => {
  it("swaps the two ends in the source and keeps the macro", () => {
    const result = ok(reverseC4Relationship(SOURCE, 2));
    expect(changed(SOURCE, result.source)).toEqual({
      removed: ['Rel_R(web, mail, "Sends")'],
      added: ['Rel_R(mail, web, "Sends")'],
    });
  });

  it("works on the macro text for Rel_U and Rel_L as well", () => {
    const source = 'Container(a, "A")\nContainer(b, "B")\nRel_U(a, b, "x")\nRel_L(b, a, "y")';
    expect(ok(reverseC4Relationship(source, 0)).source).toContain('Rel_U(b, a, "x")');
    expect(ok(reverseC4Relationship(source, 1)).source).toContain('Rel_L(a, b, "y")');
  });
});

describe("removing", () => {
  it("removes an element with its relationships and layout hints", () => {
    const result = ok(removeC4Element(SOURCE, "web"));
    expect(result.source).not.toContain("Container(web");
    expect(result.source).not.toContain("Rel(user, web");
    expect(result.source).not.toContain("Rel(web, db");
    expect(result.source).not.toContain("Rel_R(web, mail");
    expect(result.source).toContain("Lay_R(user, shop)");
  });

  it("removes only the element when the relationships are kept", () => {
    const result = ok(removeC4Element(SOURCE, "mail", { relationships: "keep" }));
    expect(changed(SOURCE, result.source)).toEqual({ removed: ['System_Ext(mail, "Mail")'], added: [] });
  });

  it("removes a layout hint with the element it names", () => {
    const result = ok(removeC4Element(SOURCE, "user", { relationships: "keep" }));
    expect(result.source).not.toContain("Lay_R(user, shop)");
    expect(result.source).toContain('Rel(user, web, "Uses", "HTTPS")');
  });

  it("removes a boundary's two lines and keeps its contents, or removes the contents too", () => {
    const keep = ok(removeC4Element(SOURCE, "shop"));
    expect(changed(SOURCE, keep.source).removed).toEqual(
      expect.arrayContaining(['System_Boundary(shop, "Web shop") {', "}"]),
    );
    expect(keep.source).toContain('  Container(web, "Web app", "React", "The UI")');
    expect(keep.source).not.toContain("Lay_R(user, shop)");
    const all = ok(removeC4Element(SOURCE, "shop", { contents: "remove" }));
    expect(all.source).not.toContain("Container(web");
    expect(all.source).not.toContain("ContainerDb(db");
    expect(all.source).not.toContain("Rel(web, db");
    expect(all.source).toContain('System_Ext(mail, "Mail")');
    expect(all.source).toContain('Person(user, "Customer", "Buys things")');
  });

  it("removes a relationship line", () => {
    const result = ok(removeC4Relationship(SOURCE, 1));
    expect(changed(SOURCE, result.source)).toEqual({ removed: ['Rel(web, db, "Reads, and writes")'], added: [] });
    expect(result.selection).toEqual({ from: result.selection.from, to: result.selection.from });
  });

  it("refuses to remove a boundary that is never closed as a block", () => {
    expect(
      refusal(removeC4Element('System_Boundary(a, "A") {\nContainer(b, "B")\n', "a", { contents: "remove" })),
    ).toMatch(/not closed/);
  });
});

describe("moving and reordering", () => {
  it("moves an element into a boundary, indenting it", () => {
    const result = ok(moveC4Element(SOURCE, "mail", "shop"));
    expect(result.source).toContain('  ContainerDb(db, "Database", "PostgreSQL")\n  System_Ext(mail, "Mail")\n}');
    expect(result.source.split("\n").filter((line) => line.includes("System_Ext")).length).toBe(1);
    expect(selected(result)).toBe('System_Ext(mail, "Mail")');
    expect(changed(SOURCE, result.source).added).toContain('  System_Ext(mail, "Mail")');
  });

  it("moves an element out of a boundary to the top level", () => {
    const result = ok(moveC4Element(SOURCE, "db", undefined));
    expect(result.source).toContain('System_Ext(mail, "Mail")\nContainerDb(db, "Database", "PostgreSQL")\n');
    expect(result.source).not.toContain("  ContainerDb(db");
  });

  it("moves a boundary with everything in it, reindenting the block", () => {
    const source = 'Boundary(a, "A") {\n  Container(c, "C")\n}\nBoundary(b, "B") {\n}';
    expect(ok(moveC4Element(source, "a", "b")).source).toBe(
      'Boundary(b, "B") {\n  Boundary(a, "A") {\n    Container(c, "C")\n  }\n}',
    );
  });

  it("brings along a relationship that sits above the new place", () => {
    const source = 'Container(a, "A")\nContainer(b, "B")\nRel(a, b, "x")\nBoundary(g, "G") {\n}';
    expect(ok(moveC4Element(source, "b", "g")).source).toBe(
      'Container(a, "A")\nBoundary(g, "G") {\n  Container(b, "B")\n  Rel(a, b, "x")\n}',
    );
  });

  it("is a no-op when the parent does not change, and refuses cycles", () => {
    expect(ok(moveC4Element(SOURCE, "web", "shop")).source).toBe(SOURCE);
    expect(refusal(moveC4Element(SOURCE, "shop", "shop"))).toMatch(/into itself/);
    expect(refusal(moveC4Element(SOURCE, "web", "mail"))).toMatch(/not a boundary/);
  });

  it("puts an element before or after a sibling", () => {
    const before = ok(reorderC4Element(SOURCE, "db", "web", "before"));
    expect(before.source).toContain(
      '  ContainerDb(db, "Database", "PostgreSQL")\n  Container(web, "Web app", "React", "The UI")\n}',
    );
    const after = ok(reorderC4Element(SOURCE, "user", "mail", "after"));
    expect(after.source).toContain('System_Ext(mail, "Mail")\nPerson(user, "Customer", "Buys things")\n');
    expect(after.source.length).toBe(SOURCE.length);
    expect(ok(reorderC4Element(SOURCE, "web", "db", "before")).source).toBe(SOURCE);
  });

  it("moves a boundary as a whole when reordering", () => {
    const result = ok(reorderC4Element(SOURCE, "shop", "user", "before"));
    expect(result.source.indexOf("System_Boundary")).toBeLessThan(result.source.indexOf("Person(user"));
    expect(result.source).toContain(
      '  Container(web, "Web app", "React", "The UI")\n  ContainerDb(db, "Database", "PostgreSQL")\n}\nPerson(user',
    );
  });

  it("refuses to reorder across parents", () => {
    expect(refusal(reorderC4Element(SOURCE, "web", "mail", "before"))).toMatch(/not in the same boundary/);
  });
});

describe("renaming", () => {
  it("renames the declaration and every reference", () => {
    const result = ok(renameC4Alias(SOURCE, "web", "frontend"));
    expect(changed(SOURCE, result.source).added).toEqual(
      expect.arrayContaining([
        '  Container(frontend, "Web app", "React", "The UI")',
        'Rel(user, frontend, "Uses", "HTTPS")',
      ]),
    );
    expect(result.source.match(/frontend/g)).toHaveLength(4);
    expect(selected(result)).toBe('Container(frontend, "Web app", "React", "The UI")');
  });

  it("renames in layout hints and boundaries", () => {
    const result = ok(renameC4Alias(SOURCE, "shop", "store"));
    expect(result.source).toContain('System_Boundary(store, "Web shop") {');
    expect(result.source).toContain("Lay_R(user, store)");
  });

  it("does not touch labels that look like the alias", () => {
    const source = 'Container(web, "web", "web")\nRel(web, web, "web")';
    expect(ok(renameC4Alias(source, "web", "app")).source).toBe('Container(app, "web", "web")\nRel(app, app, "web")');
  });

  it("refuses a bad or used alias, and a dotted one", () => {
    expect(refusal(renameC4Alias(SOURCE, "web", "db"))).toBe("Alias “db” is already used");
    expect(refusal(renameC4Alias(SOURCE, "web", "a.b"))).toMatch(/dot/);
    expect(refusal(renameC4Alias(SOURCE, "web", "has space"))).toMatch(/letters, digits/);
    expect(refusal(renameC4Alias(SOURCE, "web", ""))).toBe("Alias is required");
  });

  it("is a no-op when the name is unchanged", () => {
    expect(ok(renameC4Alias(SOURCE, "web", "web")).source).toBe(SOURCE);
  });
});

describe("settings", () => {
  it("adds a layout macro after the includes", () => {
    const result = ok(setC4Settings(SOURCE, { layout: "left-right" }));
    expect(changed(SOURCE, result.source)).toEqual({ removed: [], added: ["LAYOUT_LEFT_RIGHT()"] });
    expect(result.source.split("\n")[2]).toBe("LAYOUT_LEFT_RIGHT()");
    expect(selected(result)).toBe("LAYOUT_LEFT_RIGHT()");
  });

  it("changes and removes an existing layout macro", () => {
    const source = SOURCE.replace("title Shop", "LAYOUT_TOP_DOWN()\ntitle Shop");
    expect(changed(source, ok(setC4Settings(source, { layout: "landscape" })).source)).toEqual({
      removed: ["LAYOUT_TOP_DOWN()"],
      added: ["LAYOUT_LANDSCAPE()"],
    });
    expect(changed(source, ok(setC4Settings(source, { layout: null })).source)).toEqual({
      removed: ["LAYOUT_TOP_DOWN()"],
      added: [],
    });
    expect(ok(setC4Settings(source, { layout: "top-down" })).source).toBe(source);
  });

  it("shows the legend last, and keeps SHOW_LEGEND where it is", () => {
    const plain = SOURCE.replace("SHOW_LEGEND()\n", "");
    expect(changed(plain, ok(setC4Settings(plain, { legend: "show" })).source)).toEqual({
      removed: [],
      added: ["SHOW_LEGEND()"],
    });
    expect(ok(setC4Settings(SOURCE, { legend: "show" })).source).toBe(SOURCE);
  });

  it("switches between the legend forms and removes it", () => {
    const together = ok(setC4Settings(SOURCE, { legend: "with-legend" })).source;
    expect(together).toContain("LAYOUT_WITH_LEGEND()");
    expect(together).not.toContain("SHOW_LEGEND()");
    expect(ok(setC4Settings(together, { legend: "none" })).source).toBe(SOURCE.replace("SHOW_LEGEND()\n", ""));
  });

  it("sets layout and legend together", () => {
    const plain = SOURCE.replace("SHOW_LEGEND()\n", "");
    const result = ok(setC4Settings(plain, { layout: "left-right", legend: "with-legend" }));
    expect(result.source.split("\n").slice(2, 4)).toEqual(["LAYOUT_LEFT_RIGHT()", "LAYOUT_WITH_LEGEND()"]);
  });

  it("adds to a source with no include after @startuml", () => {
    expect(ok(setC4Settings('@startuml\nPerson(a, "A")\n@enduml', { layout: "left-right" })).source).toBe(
      '@startuml\nLAYOUT_LEFT_RIGHT()\nPerson(a, "A")\n@enduml',
    );
  });

  it("refuses a setting inside a conditional", () => {
    const source = "!include <C4/C4_Container>\n!if %true()\nLAYOUT_TOP_DOWN()\n!endif\n";
    expect(refusal(setC4Settings(source, { layout: "landscape" }))).toMatch(/inside an !if block/);
  });
});

describe("symbols", () => {
  it("lists declarations and references of every alias", () => {
    const occurrences = collectC4SymbolOccurrences(SOURCE);
    expect(occurrences.filter((item) => item.key === "web").map((item) => item.role)).toEqual([
      "declaration",
      "reference",
      "reference",
      "reference",
    ]);
    expect(occurrences.filter((item) => item.key === "shop").map((item) => item.role)).toEqual([
      "declaration",
      "reference",
    ]);
    for (const item of occurrences) expect(SOURCE.slice(item.range.from, item.range.to)).toBe(item.value);
    expect(findC4References(SOURCE, "user")).toHaveLength(3);
  });

  it("validates aliases", () => {
    expect(validateC4Alias("ok_1")).toBeUndefined();
    expect(validateC4Alias("a.b")).toMatch(/dot/);
    expect(validateC4Alias("a-b")).toMatch(/letters, digits/);
    expect(validateC4Alias("a", { identities: ["a", "b"], currentIdentity: "a" })).toBeUndefined();
    expect(validateC4Alias("b", { identities: ["a", "b"], currentIdentity: "a" })).toBe("Alias “b” is already used");
    expect(validateC4Rename(SOURCE, "web", "db")).toBe("Alias “db” is already used");
    expect(validateC4Rename(SOURCE, "web", "web2")).toBeUndefined();
  });
});

describe("limits", () => {
  it("throws on a source over the size limit, like the other diagram types", () => {
    expect(() => addC4Element("x".repeat(100_001), { macro: "Person", alias: "a", label: "A" })).toThrow(RangeError);
  });
});
