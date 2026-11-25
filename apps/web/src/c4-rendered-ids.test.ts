// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { c4RenderedShapes, c4RenderedTarget, c4SourceRelationship, type C4RenderedTarget } from "./c4-rendered-ids";
import { parseC4 } from "./c4-source";
import { sanitizeSvg } from "./render/sanitize-svg";

// Real SVG captured from the app's own renderer (@plantuml/core in the render worker, bundled C4 library).
// Regenerate with the capture spec described in docs/c4-svg-ids-spike.md.
const dir = join(process.cwd(), "tests/fixtures/c4-svg");
const svgOf = (name: string) => readFileSync(join(dir, `${name}.svg`), "utf8");
const sourceOf = (name: string) => readFileSync(join(dir, `${name}.puml`), "utf8");

function mount(svg: string): HTMLElement {
  const host = document.createElement("div");
  // The preview does the same: the engine's SVG is inserted as markup.
  host.innerHTML = svg;
  return host;
}
const shapes = (name: string) => c4RenderedShapes(mount(svgOf(name)));
type Relationship = Extract<C4RenderedTarget, { kind: "relationship" }>;
const relationships = (name: string) =>
  shapes(name)
    .map((shape) => shape.target)
    .filter((target): target is Relationship => target.kind === "relationship");

const fixtures = readdirSync(dir)
  .filter((file) => file.endsWith(".svg"))
  .map((file) => file.replace(/\.svg$/, ""));

describe("C4 rendered ids", () => {
  it("has the fixtures this suite expects", () => {
    expect(fixtures).toContain("starter-container");
    expect(fixtures.length).toBeGreaterThanOrEqual(14);
  });

  it.each(fixtures.filter((name) => !name.startsWith("edge-procedure")))(
    "maps every drawn element, boundary and relationship of %s to the source",
    (name) => {
      const doc = parseC4(sourceOf(name));
      const aliases = new Map(doc.elements.map((item) => [item.id, item]));
      const found = shapes(name);
      for (const { target } of found) {
        if (target.kind === "element") expect(aliases.get(target.alias)?.category, target.alias).not.toBe("boundary");
        if (target.kind === "element" || target.kind === "boundary") {
          const declared = aliases.get(target.alias);
          expect(declared, `alias ${target.alias}`).toBeDefined();
          // The path is the chain of enclosing boundaries, innermost last.
          expect(target.path.at(-1), target.alias).toBe(declared!.parent);
        }
        if (target.kind === "relationship") expect(c4SourceRelationship(target, doc.relationships)).toBeDefined();
      }
      // Nothing declared in the source is missing from the picture, and nothing is drawn twice.
      const drawn = found.filter((shape) => shape.target.kind === "element" || shape.target.kind === "boundary");
      expect(drawn).toHaveLength(doc.elements.length);
      expect(found.filter((shape) => shape.target.kind === "relationship")).toHaveLength(doc.relationships.length);
    },
  );

  it("resolves the Container starter to aliases, the boundary path and both endpoints", () => {
    const result = shapes("starter-container").map((shape) => shape.target);
    expect(result).toContainEqual({ kind: "element", alias: "web", path: ["shop"] });
    expect(result).toContainEqual({ kind: "boundary", alias: "shop", path: [] });
    expect(result).toContainEqual({ kind: "element", alias: "customer", path: [] });
    expect(result).toContainEqual({ kind: "relationship", from: "customer", to: "web", index: 0, pairIndex: 0 });
    expect(result).toContainEqual({ kind: "relationship", from: "api", to: "payments", index: 3, pairIndex: 0 });
    expect(result).toContainEqual({ kind: "title" });
  });

  it("resolves a click inside a shape (any descendant) to the same target", () => {
    const host = mount(svgOf("starter-container"));
    const group = host.querySelector('g[data-qualified-name="shop.api"]')!;
    for (const child of group.querySelectorAll("text, rect"))
      expect(c4RenderedTarget(child)).toEqual({ kind: "element", alias: "api", path: ["shop"] });
    expect(c4RenderedTarget(host.querySelector("defs"))).toBeUndefined();
  });

  it("numbers relationships in source order although Dynamic diagrams draw them in another order", () => {
    const doc = parseC4(sourceOf("starter-dynamic"));
    const drawn = relationships("starter-dynamic");
    // The engine writes the 4th call (api -> web) before the 3rd (api -> db) in the document.
    expect(drawn.map((item) => `${item.from}>${item.to}`)).toEqual(["customer>web", "web>api", "api>web", "api>db"]);
    for (const item of drawn)
      expect(c4SourceRelationship(item, doc.relationships)?.label).toBe(doc.relationships[item.index]?.label);
    expect(drawn.map((item) => item.index)).toEqual([0, 1, 3, 2]);
  });

  it("tells two relationships between the same pair apart by their order", () => {
    const doc = parseC4(sourceOf("rels"));
    const drawn = relationships("rels");
    const ab = drawn.filter((item) => item.from === "a" && item.to === "b");
    expect(ab.map((item) => item.pairIndex)).toEqual([0, 1]);
    expect(ab.map((item) => c4SourceRelationship(item, doc.relationships)?.label)).toEqual(["first", "second"]);
    // a -> c exists twice with opposite macros: Rel_Back(c, a) and Rel(a, c); both are found, by order.
    const ac = drawn.filter((item) => [item.from, item.to].sort().join() === "a,c");
    expect(ac.map((item) => c4SourceRelationship(item, doc.relationships)?.label)).toEqual(["back", "plain"]);
  });

  it("stores Rel_U and Rel_L reversed, so endpoints must be matched either way round", () => {
    const doc = parseC4(sourceOf("rels"));
    const byLabel = (label: string) => doc.relationships.find((item) => item.label === label)!;
    const drawn = (macro: string) => {
      const source = byLabel(macro);
      return relationships("rels").find((item) => c4SourceRelationship(item, doc.relationships) === source)!;
    };
    expect(byLabel("up")).toMatchObject({ macro: "Rel_U", from: "b", to: "c" });
    expect(drawn("up")).toMatchObject({ from: "c", to: "b" });
    expect(byLabel("left")).toMatchObject({ macro: "Rel_L", from: "d", to: "e" });
    expect(drawn("left")).toMatchObject({ from: "e", to: "d" });
    expect(drawn("down")).toMatchObject({ from: "c", to: "d" });
    expect(drawn("right")).toMatchObject({ from: "e", to: "f" });
    expect(drawn("bi")).toMatchObject({ from: "a", to: "f" });
    expect(drawn("back")).toMatchObject({ from: "c", to: "a" });
  });

  it("keeps underscores, digits and mixed case in aliases", () => {
    const aliases = shapes("edge-aliases")
      .map((shape) => shape.target)
      .flatMap((target) => (target.kind === "element" ? [target.alias] : []));
    expect(aliases).toEqual(["my_Svc_2", "A1b", "CamelCase", "x9"]);
  });

  it("nests two boundaries deep, and deployment nodes inside deployment nodes", () => {
    const targets = shapes("boundaries").map((shape) => shape.target);
    expect(targets).toContainEqual({ kind: "boundary", alias: "cb", path: ["ent", "sb"] });
    expect(targets).toContainEqual({ kind: "element", alias: "k1", path: ["ent", "sb", "cb"] });
    expect(targets).toContainEqual({ kind: "boundary", alias: "gb", path: [] });
    const nodes = shapes("deployment-nodes").map((shape) => shape.target);
    expect(nodes).toContainEqual({ kind: "boundary", alias: "n2", path: ["n1"] });
    expect(nodes).toContainEqual({ kind: "element", alias: "c1", path: ["n1", "n2"] });
  });

  it("covers the _Ext, Db and Queue variants of every element macro", () => {
    const doc = parseC4(sourceOf("family-ext-db-queue"));
    const aliases = shapes("family-ext-db-queue").flatMap((shape) =>
      shape.target.kind === "element" ? [shape.target.alias] : [],
    );
    expect(aliases).toEqual(doc.elements.map((item) => item.id));
    expect(aliases).toHaveLength(18);
  });

  it("resolves an element declared inside a custom procedure to its alias, which the source parser cannot see", () => {
    const targets = shapes("edge-procedure").map((shape) => shape.target);
    expect(targets).toContainEqual({ kind: "element", alias: "procA", path: [] });
    const doc = parseC4(sourceOf("edge-procedure"));
    expect(doc.elements.map((item) => item.id)).not.toContain("procA");
    // The relationship to it still resolves its endpoints from the picture alone.
    expect(relationships("edge-procedure")).toEqual([
      { kind: "relationship", from: "procA", to: "plain", index: 0, pairIndex: 0 },
    ]);
  });

  it("is not disturbed by labels with newlines, by a theme or by a legend", () => {
    expect(shapes("edge-labels").map((shape) => shape.target)).toEqual([
      { kind: "element", alias: "q1", path: [] },
      { kind: "element", alias: "q2", path: [] },
      { kind: "relationship", from: "q1", to: "q2", index: 0, pairIndex: 0 },
    ]);
    expect(shapes("edge-theme")).toHaveLength(3);
    const legend = shapes("legend").map((shape) => shape.target);
    expect(legend).toContainEqual({ kind: "legend" });
    expect(legend.filter((target) => target.kind === "element")).toHaveLength(2);
  });

  it("gives the person the same id with the sprite on as with it off", () => {
    const off = shapes("starter-container").map((shape) => shape.target);
    const host = mount(svgOf("starter-container-person-sprite"));
    expect(host.querySelector('g[data-qualified-name="customer"] > image')).not.toBeNull();
    expect(c4RenderedShapes(host).map((shape) => shape.target)).toEqual(off);
    // A click on the sprite itself resolves to the person.
    expect(c4RenderedTarget(host.querySelector("image"))).toEqual({ kind: "element", alias: "customer", path: [] });
  });

  it("survives the app's SVG sanitiser", () => {
    for (const name of fixtures) {
      const plain = shapes(name).map((shape) => shape.target);
      const sanitised = c4RenderedShapes(mount(sanitizeSvg(svgOf(name)))).map((shape) => shape.target);
      expect(sanitised, name).toEqual(plain);
    }
  });
});
