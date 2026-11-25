// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseC4 } from "../../c4-source";
import { buildC4Canvas, c4ConnectableShapes } from "./c4-canvas";

// Real SVG captured from the app's own renderer; see docs/c4-svg-ids-spike.md.
const dir = join(process.cwd(), "tests/fixtures/c4-svg");
const load = (name: string) => {
  const host = document.createElement("div");
  host.innerHTML = readFileSync(join(dir, `${name}.svg`), "utf8");
  return { host, source: readFileSync(join(dir, `${name}.puml`), "utf8") };
};

describe("buildC4Canvas", () => {
  it("maps every shape of the Container starter to its source item", () => {
    const { host, source } = load("starter-container");
    const doc = parseC4(source);
    const canvas = buildC4Canvas(host, doc);
    expect(canvas.relationshipsMatch).toBe(true);
    const keys = canvas.shapes.map((shape) => shape.key);
    for (const element of doc.elements) expect(keys, element.id).toContain(element.id);
    for (const relationship of doc.relationships) expect(keys).toContain(`rel:${relationship.index}`);
    expect(canvas.shapes.every((shape) => shape.editable)).toBe(true);
    expect(canvas.byKey.get("shop")?.kind).toBe("boundary");
    expect(canvas.byKey.get("web")?.selection).toEqual({ kind: "element", alias: "web" });
    expect(canvas.byKey.get("rel:0")?.selection).toEqual({ kind: "relationship", index: 0 });
  });

  it("pairs relationship ends however the engine drew them", () => {
    const { host, source } = load("rels");
    const doc = parseC4(source);
    const canvas = buildC4Canvas(host, doc);
    expect(canvas.relationshipsMatch).toBe(true);
    const drawn = canvas.shapes.filter((shape) => shape.kind === "relationship");
    expect(drawn.map((shape) => shape.index).sort()).toEqual(doc.relationships.map((rel) => rel.index));
    for (const shape of drawn) {
      const relationship = doc.relationships[shape.index!]!;
      expect([shape.ends!.first, shape.ends!.second].sort()).toEqual([relationship.from, relationship.to].sort());
    }
  });

  it("builds one shape per drawn link and element, in the sprite fixture too", () => {
    const { host, source } = load("starter-container-person-sprite");
    const doc = parseC4(source);
    const canvas = buildC4Canvas(host, doc);
    expect(canvas.shapes.filter((shape) => shape.kind !== "relationship")).toHaveLength(doc.elements.length);
    expect(canvas.byKey.get("customer")?.editable).toBe(true);
  });

  it("treats a shape that the source does not declare as select-only", () => {
    const { host, source } = load("edge-procedure");
    const doc = parseC4(source);
    const canvas = buildC4Canvas(host, doc);
    const procedure = canvas.byKey.get("procA")!;
    expect(procedure.editable).toBe(false);
    expect(procedure.selection).toEqual({ kind: "unmanaged", alias: "procA" });
    expect(c4ConnectableShapes(canvas, doc).map((shape) => shape.key)).not.toContain("procA");
  });

  it("refuses relationship edits when the drawn links and the source's calls differ in number", () => {
    const { host, source } = load("starter-container");
    const doc = parseC4(source);
    const withoutOne = { ...doc, relationships: doc.relationships.slice(1) };
    const canvas = buildC4Canvas(host, withoutOne);
    expect(canvas.relationshipsMatch).toBe(false);
    const links = canvas.shapes.filter((shape) => shape.kind === "relationship");
    expect(links.length).toBe(doc.relationships.length);
    expect(links.every((shape) => !shape.editable && shape.selection.kind === "unmanaged")).toBe(true);
    // Elements are unaffected.
    expect(canvas.byKey.get("web")?.editable).toBe(true);
  });

  it("offers elements, not boundaries, as relationship targets", () => {
    const { host, source } = load("starter-container");
    const doc = parseC4(source);
    const targets = c4ConnectableShapes(buildC4Canvas(host, doc), doc).map((shape) => shape.key);
    expect(targets).toContain("web");
    expect(targets).not.toContain("shop");
  });
});
