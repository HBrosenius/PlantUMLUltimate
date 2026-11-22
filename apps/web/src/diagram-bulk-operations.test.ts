import { describe, expect, it } from "vitest";
import {
  changeDiagramItems,
  copyDiagramItems,
  deleteMindmapItems,
  diagramBulkItems,
  pasteDiagramItems,
  setMindmapItemsBoxless,
  setMindmapItemsSide,
  type BulkDiagramKind,
} from "./diagram-bulk-operations";
import { parseMindmap } from "@plantuml-studio/diagram-mindmap";
import { parseClassDiagram } from "@plantuml-studio/diagram-class";
import { parseUseCase } from "@plantuml-studio/diagram-usecase";
import { parseWbs } from "@plantuml-studio/diagram-wbs";
import { parseSequence } from "@plantuml-studio/diagram-sequence";
import { parseActivity } from "@plantuml-studio/diagram-activity";
const NL = "\n";
const fixtures: Array<[BulkDiagramKind, string]> = [
  [
    "class",
    'class "One" as A {\n  +field: String\n  \' keep member comment\n}\nclass "Two" as B\nA --> B : keep label',
  ],
  ["component", 'component "One" as A\ncomponent "Two" as B\nA --> B : keep label'],
  ["usecase", 'actor "One" as A\nusecase "Two" as B\nA --> B : keep label'],
  ["sequence", 'participant "One" as A\nparticipant "Two" as B\nA -> B : keep label'],
  ["activity", ":One;\n:Two;"],
  ["wbs", "* Root\n**(A) One\n**(B) Two\nA --> B"],
];
const wrap = (kind: BulkDiagramKind, body: string) =>
  kind === "wbs" ? `@startwbs\n${body}\n@endwbs` : `@startuml\n${body}\n@enduml`;
const pair = (kind: BulkDiagramKind, source: string) =>
  diagramBulkItems(kind, source).filter((item) => ["One", "Two"].includes(item.label));
describe("shared diagram bulk operations", () => {
  for (const [kind, body] of fixtures) {
    it(`${kind}: changes selected styles and copies a connected selection without collisions`, () => {
      const source = wrap(kind, body);
      const keys = pair(kind, source).map((item) => item.key);
      expect(keys).toHaveLength(2);
      const changed = changeDiagramItems(kind, source, keys, "color", "Orange");
      expect(changed.applied).toBe(2);
      expect(changed.source).toContain("#Orange");
      if (kind === "class") {
        expect(changed.source).toContain("+field: String");
        expect(changed.source).toContain("' keep member comment");
      }
      const copied = copyDiagramItems(kind, source, keys)!;
      const pasted = pasteDiagramItems(kind, source, copied);
      expect(pasted.keys.length).toBeGreaterThanOrEqual(2);
      if (kind !== "wbs") expect(pasted.source.startsWith(source.slice(0, source.lastIndexOf("@end")))).toBe(true);
      if (kind === "class" || kind === "component") {
        const doc = parseClassDiagram(pasted.source);
        expect(doc.entities.map((item) => item.id)).toEqual(["a", "b", "a_copy", "b_copy"]);
        expect(doc.relationships.at(-1)).toMatchObject({ from: "a_copy", to: "b_copy", label: "keep label" });
        expect(doc.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
      } else if (kind === "usecase") {
        const doc = parseUseCase(pasted.source);
        expect(doc.elements.map((item) => item.id)).toEqual(["a", "b", "a_copy", "b_copy"]);
        expect(doc.relationships.at(-1)).toMatchObject({ from: "a_copy", to: "b_copy" });
      } else if (kind === "sequence") {
        const doc = parseSequence(pasted.source);
        expect(doc.participants.map((item) => item.id)).toEqual(["a", "b", "a_copy", "b_copy"]);
        expect(doc.messages.at(-1)).toMatchObject({ from: "A_copy", to: "B_copy", label: "keep label" });
      } else if (kind === "wbs") {
        const doc = parseWbs(pasted.source);
        expect(doc.nodes.slice(-2).map((item) => item.alias)).toEqual(["A_copy", "B_copy"]);
        expect(doc.nodes.slice(-2).every((item) => item.depth === 2)).toBe(true);
        expect(doc.relationships.find((item) => item.from === "A_copy")).toMatchObject({
          from: "A_copy",
          to: "B_copy",
        });
      } else expect(parseActivity(pasted.source).nodes).toHaveLength(4);
    });
  }
  it("keeps quoted labels, class bodies, and inline comments intact while changing styles", () => {
    const source = wrap("class", 'class "A { #Red" as A #Pink <<old>> {\n +value: B\n}\nclass B #Blue \' #comment');
    const items = diagramBulkItems("class", source);
    const changed = changeDiagramItems(
      "class",
      source,
      items.map((item) => item.key),
      "color",
      "Green",
    );
    expect(changed.source).toContain('"A { #Red" as A  <<old>> #Green {');
    expect(changed.source).toContain("+value: B");
    expect(changed.source).toContain("' #comment");
  });
  it("copies a selected subtree only once and remaps its internal relationships", () => {
    const source = wrap("wbs", "* Root\n**(A) One\n***(C) Child\n**(B) Two\nA --> C");
    const items = diagramBulkItems("wbs", source).filter((item) => ["One", "Child"].includes(item.label));
    const copied = copyDiagramItems(
      "wbs",
      source,
      items.map((item) => item.key),
    )!;
    expect(copied.text.match(/Child/g)).toHaveLength(1);
    const result = pasteDiagramItems(
      "wbs",
      source,
      copied,
      parseWbs(source).nodes.find((item) => item.alias === "B")!.id,
    );
    const doc = parseWbs(result.source);
    expect(doc.nodes.find((item) => item.alias === "A_copy")?.depth).toBe(3);
    expect(doc.nodes.find((item) => item.alias === "C_copy")?.depth).toBe(4);
  });
  it("preserves nested activity blocks", () => {
    const source = wrap(
      "activity",
      "if (ready?) then (yes)\n:One;\nif (nested?) then (yes)\n:Two;\nendif\nendif\n:After;",
    );
    const item = diagramBulkItems("activity", source).find((item) => item.copyRange.to > item.range.to)!;
    const copied = copyDiagramItems("activity", source, [item.key])!;
    expect(copied.text.match(/endif/g)).toHaveLength(2);
    expect(copied.text).not.toContain("After");
  });
  it("rejects cross-type pastes and invalid style input", () => {
    expect(() => pasteDiagramItems("class", wrap("class", "class A"), { kind: "activity", text: ":A;" })).toThrow(
      "same type",
    );
    expect(() => changeDiagramItems("class", wrap("class", "class A"), [], "color", "Red\nclass Evil")).toThrow();
  });
  it("message-only pastes keep the original participant endpoints", () => {
    const source = wrap("sequence", "participant A\nparticipant B\nA -> B : Hello");
    const item = diagramBulkItems("sequence", source).find((item) => item.attribute === "data-sequence-message-id")!;
    const result = pasteDiagramItems("sequence", source, copyDiagramItems("sequence", source, [item.key])!);
    expect(parseSequence(result.source).messages.at(-1)).toMatchObject({ from: "A", to: "B" });
  });
  it("bulk styles and copies shorthand Use Case elements independently of external relationships", () => {
    const source = wrap("usecase", ":One: --> (Two)");
    const keys = pair("usecase", source).map((item) => item.key);
    const changed = changeDiagramItems("usecase", source, keys, "color", "Orange");
    expect(changed.applied).toBe(2);
    expect(parseUseCase(changed.source).elements.every((item) => item.color === "#Orange")).toBe(true);
    const copied = copyDiagramItems("usecase", source, [keys[0]!])!;
    expect(copied.text).toContain('actor "One"');
    expect(copied.text).not.toContain("Two");
    const result = pasteDiagramItems("usecase", source, copyDiagramItems("usecase", source, keys)!);
    const doc = parseUseCase(result.source);
    expect(doc.elements).toHaveLength(4);
    expect(doc.relationships.at(-1)).toMatchObject({ from: "one_copy", to: "two_copy" });
  });
  it("styles only note headers and preserves literal color and stereotype text in note bodies", () => {
    const source = wrap("class", "class A\nnote right of A #Pink : Keep #Blue and <<literal>>");
    const note = diagramBulkItems("class", source).find((item) => item.label.startsWith("Keep"))!;
    const result = changeDiagramItems("class", source, [note.key], "color", "Orange");
    expect(result.source).toContain("note right of A #Orange : Keep #Blue and <<literal>>");
  });
  it("sets Activity and WBS stereotypes without dropping other node styles", () => {
    const activity = wrap("activity", ":One; <<old>> <<#Pink>>\n:Two;");
    const action = pair("activity", activity)[0]!;
    const result = changeDiagramItems("activity", activity, [action.key], "stereotype", "service");
    expect(parseActivity(result.source).nodes[0]).toMatchObject({
      label: "One",
      color: "#Pink",
      stereotype: "service",
    });
    const wbs = wrap("wbs", "* Root\n**(A)[#Pink] One <<old>>");
    const node = pair("wbs", wbs)[0]!;
    const changed = changeDiagramItems("wbs", wbs, [node.key], "stereotype", "service");
    expect(parseWbs(changed.source).nodes[1]).toMatchObject({
      alias: "A",
      label: "One",
      color: "#Pink",
      stereotype: "service",
    });
  });
  it("changes Sequence arrow color without dropping its line style", () => {
    const source = wrap("sequence", "participant A\nparticipant B\nA -[#Red,dashed]> B : Keep #Red text");
    const message = diagramBulkItems("sequence", source).find((item) => item.attribute === "data-sequence-message-id")!;
    const result = changeDiagramItems("sequence", source, [message.key], "color", "Orange");
    expect(result.source).toContain("[dashed,#Orange]");
    expect(result.source).toContain("Keep #Red text");
  });
});

describe("mindmap bulk operations", () => {
  const wrap = (body: string) => `@startmindmap${NL}${body}${NL}@endmindmap`;
  const source = wrap(["* Root", "** One", "*** One A", "** Two", "** Three"].join(NL));
  const keyOf = (src: string, label: string) =>
    diagramBulkItems("mindmap", src).find((item) => item.label === label)!.key;

  it("lists every node with colour, style class, boxless and delete support", () => {
    const items = diagramBulkItems("mindmap", source);
    expect(items.map((item) => item.label)).toEqual(["Root", "One", "One A", "Two", "Three"]);
    expect(items.every((item) => item.color && item.stereotype && item.boxless && item.deletable)).toBe(true);
    expect(items[0]!.attribute).toBe("data-mindmap-node-id");
  });

  it("colours and styles several nodes in one edit without touching the others", () => {
    const keys = [keyOf(source, "One"), keyOf(source, "Three")];
    const coloured = changeDiagramItems("mindmap", source, keys, "color", "Orange");
    expect(coloured.applied).toBe(2);
    expect(coloured.source).toBe(
      wrap(["* Root", "**[#Orange] One", "*** One A", "** Two", "**[#Orange] Three"].join(NL)),
    );
    const styled = changeDiagramItems("mindmap", coloured.source, keys, "stereotype", "key");
    expect(styled.source).toContain("**[#Orange] One <<key>>");
    expect(changeDiagramItems("mindmap", styled.source, keys, "color", "").source).toContain("** One <<key>>");
    expect(changeDiagramItems("mindmap", styled.source, keys, "stereotype", "").source).toBe(coloured.source);
  });

  it("toggles boxless on the selection and keeps colours and the line count", () => {
    const keys = [keyOf(source, "One"), keyOf(source, "Two")];
    const coloured = changeDiagramItems("mindmap", source, [keys[0]!], "color", "red").source;
    const result = setMindmapItemsBoxless(coloured, keys, true);
    expect(result.applied).toBe(2);
    expect(result.source).toContain("**[#red]_ One");
    expect(result.source).toContain("**_ Two");
    expect(setMindmapItemsBoxless(result.source, keys, false).source).toBe(coloured);
  });

  it("skips Markdown-form nodes", () => {
    const markdown = wrap(["# Root", "## One", "## Two"].join(NL));
    const items = diagramBulkItems("mindmap", markdown);
    expect(items.some((item) => item.color || item.boxless || item.deletable)).toBe(false);
    const keys = items.map((item) => item.key);
    expect(changeDiagramItems("mindmap", markdown, keys, "color", "red")).toMatchObject({
      applied: 0,
      source: markdown,
    });
    expect(() => deleteMindmapItems(markdown, keys)).toThrow(/Convert to \* markers/);
  });

  it("deletes several nodes in one edit and lets a selected parent take its child", () => {
    const keys = [keyOf(source, "One"), keyOf(source, "One A"), keyOf(source, "Three")];
    const result = deleteMindmapItems(source, keys);
    expect(result).toMatchObject({ applied: 2, removed: 3 });
    expect(result.source).toBe(wrap(["* Root", "** Two"].join(NL)));
    expect(parseMindmap(result.source).diagnostics).toEqual([]);
  });

  it("blocks deleting every root but allows deleting one of several", () => {
    expect(() => deleteMindmapItems(source, [keyOf(source, "Root")])).toThrow(/at least one root/);
    const two = wrap(["* First", "** A", "* Second", "** B"].join(NL));
    expect(() =>
      deleteMindmapItems(
        two,
        diagramBulkItems("mindmap", two).map((item) => item.key),
      ),
    ).toThrow(/at least one root/);
    expect(deleteMindmapItems(two, [keyOf(two, "First")]).source).toBe(wrap(["* Second", "** B"].join(NL)));
  });
  describe("bulk side change", () => {
    const keysOf = (src: string, ...labels: string[]) => labels.map((label) => keyOf(src, label));

    it("moves every selected branch with its subtree in one edit and parses clean", () => {
      const result = setMindmapItemsSide(source, keysOf(source, "One", "Three"), "left");
      expect(result).toMatchObject({ applied: 2, skipped: 0 });
      expect(result.source).toBe(wrap(["* Root", "-- One", "--- One A", "** Two", "-- Three"].join(NL)));
      expect(parseMindmap(result.source).diagnostics).toEqual([]);
      const back = setMindmapItemsSide(result.source, keysOf(result.source, "One", "Three"), "right");
      expect(back.source).toBe(wrap(["* Root", "++ One", "+++ One A", "** Two", "++ Three"].join(NL)));
    });

    it("skips nodes that own no side, like the single-node inspector, and moves a parent once", () => {
      const result = setMindmapItemsSide(source, keysOf(source, "Root", "One", "One A"), "left");
      expect(result).toMatchObject({ applied: 1, skipped: 2 });
      expect(result.source).toBe(wrap(["* Root", "-- One", "--- One A", "** Two", "** Three"].join(NL)));
      const onlyDeep = setMindmapItemsSide(source, keysOf(source, "One A"), "left");
      expect(onlyDeep).toMatchObject({ applied: 0, source });
    });

    it("changes nothing for branches that are already on that side", () => {
      const result = setMindmapItemsSide(source, keysOf(source, "One", "Two"), "right");
      expect(result).toMatchObject({ applied: 0, source });
    });

    it("offers no side in Markdown form or in a right to left document", () => {
      const markdown = wrap(["# Root", "## One"].join(NL));
      expect(diagramBulkItems("mindmap", markdown).some((item) => item.side)).toBe(false);
      const mirrored = `@startmindmap${NL}right to left direction${NL}* Root${NL}** One${NL}@endmindmap`;
      expect(diagramBulkItems("mindmap", mirrored).some((item) => item.side)).toBe(false);
      expect(setMindmapItemsSide(mirrored, keysOf(mirrored, "One"), "left")).toMatchObject({ applied: 0 });
    });

    it("flags only direct children of a root as owning a side", () => {
      const sided = diagramBulkItems("mindmap", source)
        .filter((item) => item.side)
        .map((item) => item.label);
      expect(sided).toEqual(["One", "Two", "Three"]);
    });

    it("keeps CRLF line endings", () => {
      const lines = ["@startmindmap", "* Root", "** One", "*** One A", "** Two", "** Three", "@endmindmap"];
      const crlf = lines.join("\r\n");
      const result = setMindmapItemsSide(crlf, keysOf(crlf, "One", "Two"), "left");
      expect(result.applied).toBe(2);
      expect(result.source).toBe(
        ["@startmindmap", "* Root", "-- One", "--- One A", "-- Two", "** Three", "@endmindmap"].join("\r\n"),
      );
    });

    it("moves a branch with a multi-line label and keeps the others in step", () => {
      const multi = wrap(["* Root", "**:One", "line two;", "** Two", "** Three"].join(NL));
      const result = setMindmapItemsSide(multi, keysOf(multi, "Two", "Three"), "left");
      expect(result.applied).toBe(2);
      const after = parseMindmap(result.source);
      expect(after.diagnostics).toEqual([]);
      expect(after.nodes.filter((node) => node.depth === 2).map((node) => `${node.label}:${node.side}`)).toEqual(
        expect.arrayContaining(["Two:left", "Three:left"]),
      );
    });
  });
});
