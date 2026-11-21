// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMindmap } from "@plantuml-studio/diagram-mindmap";
import { bindTreeNodeHitTargets, type TreeNodeHitTargetOptions } from "../../tree-preview/use-tree-node-hit-targets";
import { isMirroredDirection, mindmapRenderOrder } from "./mindmap-render-order";

// Rendered with the pinned engine by scripts/render-mindmap-hit-order.mjs: `order` lists node indices in the
// order the engine draws their labels.
const fixtures = JSON.parse(
  readFileSync(join(process.cwd(), "tests/fixtures/mindmap-svg/hit-order.json"), "utf8"),
) as Record<string, { source: string; order: number[] }>;

describe("mindmapRenderOrder", () => {
  for (const [name, fixture] of Object.entries(fixtures)) {
    it(`is the order the engine draws ${name}`, () => {
      const document = parseMindmap(fixture.source);
      const indices = mindmapRenderOrder(document).map((node) => document.nodes.indexOf(node));
      expect(indices).toEqual(fixture.order);
    });
  }

  it("treats right to left and bottom to top as mirrored directions", () => {
    expect(isMirroredDirection(parseMindmap("@startmindmap\nright to left direction\n* R\n@endmindmap"))).toBe(true);
    expect(isMirroredDirection(parseMindmap("@startmindmap\nbottom to top direction\n* R\n@endmindmap"))).toBe(true);
    expect(isMirroredDirection(parseMindmap("@startmindmap\ntop to bottom direction\n* R\n@endmindmap"))).toBe(false);
    expect(isMirroredDirection(parseMindmap("@startmindmap\n* R\n@endmindmap"))).toBe(false);
  });
});

const options = (order: TreeNodeHitTargetOptions["order"]): TreeNodeHitTargetOptions => ({
  attribute: "data-mindmap-node-id",
  hitClass: "mindmap-node-hit",
  selectedClass: "mindmap-selected-node",
  staleSelector: ".mindmap-node-hit",
  ariaLabel: (node) => `Select ${node.label}`,
  textSelector: "svg > g > text",
  matchRuns: true,
  ...(order ? { order } : {}),
});

function drawnHost(labels: string[], furniture: string[] = []) {
  const host = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const top = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svg.append(top);
  const add = (parent: Element, label: string) => {
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.textContent = label;
    parent.append(text);
    return text;
  };
  for (const label of furniture) {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    top.append(group);
    add(group, label);
  }
  const texts = labels.map((label) => add(top, label));
  host.append(svg);
  return { host, texts };
}

describe("binding mindmap nodes to the drawn labels", () => {
  Object.defineProperty(SVGElement.prototype, "getBBox", {
    configurable: true,
    value: () => ({ x: 0, y: 0, width: 10, height: 10 }),
  });

  // Draws each fixture's labels in the engine's order, then checks that every node is bound to the text that
  // stands at its own position in that order: duplicate labels must not swap.
  for (const [name, fixture] of Object.entries(fixtures)) {
    it(`gives duplicate labels to the right nodes in ${name}`, () => {
      const document = parseMindmap(fixture.source);
      const { host, texts } = drawnHost(fixture.order.map((index) => document.nodes[index]!.label));
      const targets = bindTreeNodeHitTargets(
        host,
        document.nodes,
        options(() => mindmapRenderOrder(document)),
      );
      expect(targets.size).toBe(document.nodes.length);
      fixture.order.forEach((nodeIndex, position) => {
        expect(targets.get(document.nodes[nodeIndex]!.id)?.text).toBe(texts[position]);
      });
    });
  }

  it("would swap duplicates in a mirrored document if it used the left-to-right order", () => {
    const fixture = fixtures["rtl-mixed-duplicates"]!;
    const document = parseMindmap(fixture.source);
    const { host, texts } = drawnHost(fixture.order.map((index) => document.nodes[index]!.label));
    // Plain source order, which is what a WBS-style matcher would use.
    const targets = bindTreeNodeHitTargets(host, document.nodes, options(undefined));
    const wrong = fixture.order.filter(
      (nodeIndex, position) => targets.get(document.nodes[nodeIndex]!.id)?.text !== texts[position],
    );
    expect(wrong.length).toBeGreaterThan(0);
  });

  it("ignores title, caption and legend, which are nested in their own groups", () => {
    const { host, texts } = drawnHost(["Title", "Root", "Title"], ["Title"]);
    const document = parseMindmap("@startmindmap\ntitle Title\n* Title\n** Root\n*** Title\n@endmindmap");
    const targets = bindTreeNodeHitTargets(host, document.nodes, options(undefined));
    // The nested furniture text is not a candidate, so the first "Title" node takes the first direct text.
    expect(targets.get("mindmap-0")?.text).toBe(texts[0]);
    expect(targets.get("mindmap-2")?.text).toBe(texts[2]);
  });

  it("matches Creole labels that the engine draws as several runs", () => {
    const { host, texts } = drawnHost(["Root", "italic", " and ", "strike", "Other"]);
    const document = parseMindmap("@startmindmap\n* Root\n** //italic// and --strike--\n** Other\n@endmindmap");
    const targets = bindTreeNodeHitTargets(host, document.nodes, options(undefined));
    expect(targets.get("mindmap-1")?.texts).toEqual([texts[1], texts[2], texts[3]]);
    expect(targets.get("mindmap-2")?.text).toBe(texts[4]);
  });

  it("matches icons, colour tags, code points and links by their drawn text", () => {
    const { host, texts } = drawnHost(["Root", " Flag", "red text", "café", "Home"]);
    const document = parseMindmap(
      "@startmindmap\n* Root\n** <&flag> Flag\n** <color:red>red text</color>\n** caf<U+00E9>\n** [[http://x.test Home]]\n@endmindmap",
    );
    const targets = bindTreeNodeHitTargets(host, document.nodes, options(undefined));
    expect([...targets.keys()]).toEqual(["mindmap-0", "mindmap-1", "mindmap-2", "mindmap-3", "mindmap-4"]);
    expect(targets.get("mindmap-3")?.text).toBe(texts[3]);
  });

  it("matches a multi-line label as consecutive lines", () => {
    const { host, texts } = drawnHost(["Root", "first", "second", "Other"]);
    const document = parseMindmap("@startmindmap\n* Root\n**:first\nsecond;\n** Other\n@endmindmap");
    const targets = bindTreeNodeHitTargets(host, document.nodes, options(undefined));
    expect(targets.get("mindmap-1")?.texts).toEqual([texts[1], texts[2]]);
  });

  it("leaves a node without a drawn label unbound instead of guessing", () => {
    const { host } = drawnHost(["Root"]);
    const document = parseMindmap("@startmindmap\n* Root\n** Missing\n@endmindmap");
    const targets = bindTreeNodeHitTargets(host, document.nodes, options(undefined));
    expect([...targets.keys()]).toEqual(["mindmap-0"]);
  });
});
