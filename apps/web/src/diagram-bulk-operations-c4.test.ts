import { describe, expect, it } from "vitest";
import { parseC4 } from "./c4-source";
import {
  changeDiagramItems,
  copyDiagramItems,
  deleteC4Items,
  diagramBulkItems,
  pasteDiagramItems,
} from "./diagram-bulk-operations";

const SOURCE = [
  "@startuml",
  "!include <C4/C4_Container>",
  'Person(user, "Customer")',
  'System_Boundary(shop, "Shop") {',
  '  Container(web, "Web app", "React")',
  '  ContainerDb(db, "Database", "PostgreSQL", $tags="store")',
  "}",
  'Rel(user, web, "Uses")',
  'Rel(web, db, "Reads")',
  "@enduml",
].join("\n");

const keys = (source: string, ...ids: string[]) =>
  diagramBulkItems("c4", source)
    .filter((item) => ids.includes(item.id))
    .map((item) => item.key);

describe("C4 bulk operations", () => {
  it("lists elements, boundaries and relationships with the keys the canvas uses", () => {
    const items = diagramBulkItems("c4", SOURCE);
    expect(items.map((item) => item.id)).toEqual(["user", "shop", "web", "db", "rel:0", "rel:1"]);
    expect(items.every((item) => item.attribute === "data-c4-object-id")).toBe(true);
    expect(items.find((item) => item.id === "web")).toMatchObject({ label: "Web app", tags: true, deletable: true });
    // A boundary is copied with what is inside it.
    const shop = items.find((item) => item.id === "shop")!;
    expect(SOURCE.slice(shop.copyRange.from, shop.copyRange.to)).toContain("ContainerDb(db");
  });

  it("does not offer an alias that is declared twice, and blocks what sits in an !if", () => {
    const source = SOURCE.replace(
      'Person(user, "Customer")',
      'Person(web, "Clash")\n!if (true)\nPerson(p, "P")\n!endif',
    );
    const items = diagramBulkItems("c4", source);
    expect(items.some((item) => item.id === "web")).toBe(false);
    expect(items.find((item) => item.id === "p")).toMatchObject({ tags: false, deletable: false });
  });

  it("copies selected elements with the relationships between them, and nothing outside", () => {
    const copied = copyDiagramItems("c4", SOURCE, keys(SOURCE, "web", "db"))!;
    expect(copied.kind).toBe("c4");
    expect(copied.text).toBe(
      [
        '  Container(web, "Web app", "React")',
        '  ContainerDb(db, "Database", "PostgreSQL", $tags="store")',
        'Rel(web, db, "Reads")',
      ].join("\n"),
    );
    expect(copyDiagramItems("c4", SOURCE, keys(SOURCE, "web"))!.text).toBe('  Container(web, "Web app", "React")');
  });

  it("pastes a copy with new aliases that its own relationships follow", () => {
    const copied = copyDiagramItems("c4", SOURCE, keys(SOURCE, "web", "db"))!;
    const result = pasteDiagramItems("c4", SOURCE, copied);
    expect(result.source).toContain('Container(web_copy, "Web app", "React")');
    expect(result.source).toContain('Rel(web_copy, db_copy, "Reads")');
    expect(result.source).toContain('Rel(web, db, "Reads")');
    const document = parseC4(result.source);
    expect(document.elements.map((item) => item.id)).toEqual(["user", "shop", "web", "db", "web_copy", "db_copy"]);
    expect(result.keys).toEqual(expect.arrayContaining(["data-c4-object-id:web_copy", "data-c4-object-id:db_copy"]));
  });

  it("copies a boundary with its contents", () => {
    const result = pasteDiagramItems("c4", SOURCE, copyDiagramItems("c4", SOURCE, keys(SOURCE, "shop"))!);
    expect(parseC4(result.source).elements.map((item) => item.id)).toEqual([
      "user",
      "shop",
      "web",
      "db",
      "shop_copy",
      "web_copy",
      "db_copy",
    ]);
  });

  it("refuses to copy from inside a procedure, with the reason", () => {
    const source = SOURCE.replace('Person(user, "Customer")', '!if (true)\nPerson(user, "Customer")\n!endif');
    expect(() => copyDiagramItems("c4", source, keys(source, "user"))).toThrow(/inside an !if block.*copied here/);
  });

  it("sets and clears tags on every selected element and relationship", () => {
    const selected = keys(SOURCE, "user", "web", "rel:0");
    const tagged = changeDiagramItems("c4", SOURCE, selected, "tags", "important");
    expect(tagged).toMatchObject({ applied: 3, skipped: 0 });
    expect(tagged.source).toContain('Person(user, "Customer", $tags="important")');
    expect(tagged.source).toContain('Container(web, "Web app", "React", $tags="important")');
    expect(tagged.source).toContain('Rel(user, web, "Uses", $tags="important")');
    expect(tagged.source).toContain('$tags="store")');
    const cleared = changeDiagramItems("c4", tagged.source, selected, "tags", "");
    expect(cleared.source).toBe(SOURCE);
  });

  it("changes only the tags, so a color or stereotype request skips C4 items", () => {
    expect(changeDiagramItems("c4", SOURCE, keys(SOURCE, "user"), "color", "red")).toMatchObject({
      applied: 0,
      skipped: 1,
    });
    expect(() => changeDiagramItems("c4", SOURCE, keys(SOURCE, "user"), "tags", 'a"b')).toThrow("without quotes");
  });

  it("refuses to change items it can't edit, with the message of the source edit", () => {
    const source = SOURCE.replace('Rel(web, db, "Reads")', 'Rel(web, db, "Reads", $tags=$t + "x")');
    expect(() => changeDiagramItems("c4", source, keys(source, "rel:1"), "tags", "x")).toThrow(/expression/);
    const inIf = SOURCE.replace('Person(user, "Customer")', '!if (true)\nPerson(user, "Customer")\n!endif');
    expect(() => changeDiagramItems("c4", inIf, keys(inIf, "user"), "tags", "x")).not.toThrow();
    expect(changeDiagramItems("c4", inIf, keys(inIf, "user"), "tags", "x")).toMatchObject({ applied: 0, skipped: 1 });
  });

  describe("delete", () => {
    it("deletes elements with their relationships, and relationships on their own", () => {
      const result = deleteC4Items(SOURCE, keys(SOURCE, "web", "rel:1"));
      expect(result.source).not.toContain("Container(web");
      expect(result.source).not.toContain("Rel(user, web");
      expect(result.source).not.toContain("Rel(web, db");
      expect(result).toMatchObject({ applied: 2, removed: 3 });
      expect(parseC4(result.source).elements.map((item) => item.id)).toEqual(["user", "shop", "db"]);
    });

    it("keeps what is inside a deleted boundary", () => {
      const result = deleteC4Items(SOURCE, keys(SOURCE, "shop"));
      expect(parseC4(result.source).elements.map((item) => item.id)).toEqual(["user", "web", "db"]);
    });

    it("refuses a selection that holds something it can't delete, and changes nothing", () => {
      const source = SOURCE.replace('Person(user, "Customer")', '!if (true)\nPerson(user, "Customer")\n!endif');
      expect(() => deleteC4Items(source, keys(source, "user", "web"))).toThrow(/inside an !if block/);
    });
  });
});
