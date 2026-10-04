import { describe, expect, it } from "vitest";
import {
  changeDiagramItems,
  copyDiagramItems,
  diagramBulkItems,
  pasteDiagramItems,
  type BulkDiagramKind,
} from "./diagram-bulk-operations";
import { parseClassDiagram } from "@plantuml-studio/diagram-class";
import { parseUseCase } from "@plantuml-studio/diagram-usecase";
import { parseWbs } from "@plantuml-studio/diagram-wbs";
import { parseSequence } from "@plantuml-studio/diagram-sequence";
import { parseActivity } from "@plantuml-studio/diagram-activity";
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
