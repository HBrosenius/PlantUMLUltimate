import { describe, expect, it } from "vitest";
import {
  collectActivitySymbolOccurrences,
  deleteActivityNode,
  deleteActivityControlBlock,
  insertActivityAction,
  insertActivityArrow,
  insertActivityNote,
  insertActivityPartition,
  insertActivityStructure,
  insertActivityTerminal,
  parseActivity,
  updateActivityAction,
  updateActivityNote,
  updateActivityNoteWithTarget,
  reorderActivityAction,
  reorderActivityControlBlock,
  moveActivityActionToPartition,
  moveActivityPartition,
  updateActivityArrow,
  updateActivityControl,
} from "./index";

describe("activity operations", () => {
  it("treats each action and partition declaration as a distinct semantic symbol", () => {
    const source =
      '@startuml\npartition "Operations" {\n:Review order;\nnote right\nReview order details\nend note\n:Review order;\n}\n@enduml';
    const document = parseActivity(source);
    const occurrences = collectActivitySymbolOccurrences(source, document);

    expect(occurrences).toMatchObject([
      { kind: "activity-partition", key: "operations", value: "Operations" },
      { kind: "activity-action", key: "action-0", value: "Review order" },
      { kind: "activity-action", key: "action-1", value: "Review order" },
    ]);
    expect(occurrences.map((item) => source.slice(item.range.from, item.range.to))).toEqual([
      "Operations",
      "Review order",
      "Review order",
    ]);
  });

  it("round-trips actions, partitions, and notes without rewriting unrelated source", () => {
    let source = "@startuml\n' keep me\nstart\nstop\n@enduml";
    source = insertActivityPartition(source, parseActivity(source), { label: "Fulfilment", color: "Lavender" });
    let document = parseActivity(source);
    source = insertActivityAction(source, document, {
      label: "Pack order",
      color: "PaleGreen",
      partitionId: "fulfilment",
    });
    document = parseActivity(source);
    expect(source).toContain('partition "Fulfilment" #Lavender {\n:Pack order; <<#PaleGreen>>\n}');
    source = updateActivityAction(
      source,
      document.nodes.find((item) => item.kind === "action")!,
      { label: "Pack and label" },
    );
    source = insertActivityNote(source, parseActivity(source), {
      placement: "right",
      text: "Warehouse\noperation",
      color: "Wheat",
    });
    document = parseActivity(source);
    source = updateActivityNote(source, document.notes[0]!, { placement: "left", text: "Internal" });
    expect(source).toContain("note left\nInternal\nend note");
    expect(source).toContain("' keep me");
    document = parseActivity(source);
    source = deleteActivityNode(
      source,
      document.nodes.find((item) => item.kind === "action")!,
    );
    expect(source).not.toContain("Pack and label");
    expect(source).toContain("' keep me");
  });
  it("edits controls and arrows and reorders an action with its note", () => {
    let source =
      "@startuml\nstart\n:A;\nnote right\nA note\nend note\n:B;\nif (Ready?) then (yes)\n-[#Blue,dashed]-> [go]\nendif\nstop\n@enduml";
    let document = parseActivity(source);
    source = updateActivityControl(source, document.controls[0]!, { condition: "Approved?", label: "ok" });
    document = parseActivity(source);
    source = updateActivityArrow(source, document.arrows[0]!, { color: "Red", lineStyle: "dotted", label: "continue" });
    document = parseActivity(source);
    source = reorderActivityAction(source, document, document.nodes[1]!, document.nodes[2]!, "after");
    expect(source).toContain(":B;\n:A;\nnote right\nA note\nend note");
    expect(source).toContain("if (Approved?) then (ok)");
    expect(source).toContain("-[#Red,dotted]-> [continue]");
  });
  it("does not reorder actions across a flow control", () => {
    const source = "@startuml\nstart\n:A;\nif (Ready?) then (yes)\n:B;\nendif\nstop\n@enduml";
    const document = parseActivity(source);
    expect(reorderActivityAction(source, document, document.nodes[1]!, document.nodes[2]!, "after")).toBe(source);
  });
  it("inserts complete flow structures and terminals", () => {
    let source = '@startuml\npartition "Work" {\n}\n@enduml';
    let document = parseActivity(source);
    source = insertActivityStructure(source, document, {
      kind: "if",
      condition: "Approved?",
      actionLabel: "Continue",
      partitionId: "work",
    });
    expect(source).toContain("if (Approved?) then (yes)\n  :Continue;\nelse (no)\n  :Alternative action;\nendif\n}");
    document = parseActivity(source);
    expect(document.diagnostics).toHaveLength(0);
    source = insertActivityTerminal(source, "stop");
    expect(source).toMatch(/stop\n+@enduml/);
  });
  it("deletes a complete nested flow block", () => {
    const source = "@startuml\n:A;\nif (Outer?) then\nwhile (Inner?)\n:B;\nendwhile\nendif\n:C;\n@enduml";
    const document = parseActivity(source);
    const updated = deleteActivityControlBlock(source, document, document.controls[0]!);
    expect(updated).toBe("@startuml\n:A;\n:C;\n@enduml");
    expect(parseActivity(updated).diagnostics).toHaveLength(0);
  });
  it("moves actions and notes between parsed targets without rewriting unrelated source", () => {
    let source =
      '@startuml\n\' keep\npartition "One" {\n:A;\nnote right\nAttached\nend note\n}\npartition "Two" {\n:B;\n}\n@enduml';
    let document = parseActivity(source);
    source = moveActivityActionToPartition(source, document, document.nodes[0]!, "two");
    expect(source).toContain('partition "Two" {\n:B;\n:A;\nnote right\nAttached\nend note\n}');
    document = parseActivity(source);
    source = updateActivityNoteWithTarget(source, document, document.notes[0]!, {
      text: "Moved",
      placement: "left",
      targetId: document.nodes[0]!.id,
    });
    expect(source.indexOf("note left\nMoved")).toBeLessThan(source.indexOf(":A;"));
    expect(source).toContain("' keep");
  });
  it("inserts an explicit arrow after its selected flow item", () => {
    const source = "@startuml\n:A;\n:B;\n@enduml";
    const document = parseActivity(source);
    const updated = insertActivityArrow(source, document, {
      targetId: document.nodes[0]!.id,
      label: "next",
      color: "Blue",
      lineStyle: "dashed",
    });
    expect(updated).toContain(":A;\n-[#Blue,dashed]-> [next]\n:B;");
  });
  it("drag-reorders an action into another partition", () => {
    const source = '@startuml\npartition "One" {\n:A;\n}\npartition "Two" {\n:B;\n}\n@enduml';
    const document = parseActivity(source);
    const updated = reorderActivityAction(source, document, document.nodes[0]!, document.nodes[1]!, "after");
    expect(updated).toContain('partition "One" {\n}\npartition "Two" {\n:B;\n:A;\n}');
    expect(parseActivity(updated).nodes.find((node) => node.label === "A")?.partitionId).toBe("two");
  });
  it("moves a partition under another partition and rejects descendant cycles", () => {
    const source = '@startuml\npartition "One" {\n:A;\n}\npartition "Two" {\n:B;\n}\n@enduml';
    let document = parseActivity(source);
    const nested = moveActivityPartition(source, document, document.partitions[0]!, "two");
    expect(nested).toContain('partition "Two" {\n:B;\npartition "One" {\n:A;\n}\n}');
    document = parseActivity(nested);
    expect(document.partitions.find((item) => item.id === "one")?.parentId).toBe("two");
    expect(
      moveActivityPartition(
        nested,
        document,
        document.partitions.find((item) => item.id === "two")!,
        "one",
      ),
    ).toBe(nested);
  });
  it("reorders a complete nested control block around an action", () => {
    const source = "@startuml\n:A;\nif (Outer?) then\nwhile (Inner?)\n:B;\nendwhile\nendif\n:C;\n@enduml";
    const document = parseActivity(source);
    const updated = reorderActivityControlBlock(source, document, document.controls[0]!, document.nodes[2]!, "after");
    expect(updated).toContain(":C;\nif (Outer?) then\nwhile (Inner?)\n:B;\nendwhile\nendif");
    expect(parseActivity(updated).diagnostics).toHaveLength(0);
  });
});
