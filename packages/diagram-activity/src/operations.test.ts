import { describe, expect, it } from "vitest";
import {
  deleteActivityNode,
  insertActivityAction,
  insertActivityNote,
  insertActivityPartition,
  parseActivity,
  updateActivityAction,
  updateActivityNote,
  reorderActivityAction,
  updateActivityArrow,
  updateActivityControl,
} from "./index";

describe("activity operations", () => {
  it("round-trips actions, partitions, and notes without rewriting unrelated source", () => {
    let source = "@startuml\n' keep me\nstart\nstop\n@enduml";
    source = insertActivityPartition(source, parseActivity(source), { label: "Fulfilment", color: "Lavender" });
    let document = parseActivity(source);
    source = insertActivityAction(source, document, { label: "Pack order", color: "PaleGreen", partitionId: "fulfilment" });
    document = parseActivity(source);
    expect(source).toContain('partition "Fulfilment" #Lavender {\n:Pack order; <<#PaleGreen>>\n}');
    source = updateActivityAction(source, document.nodes.find((item) => item.kind === "action")!, { label: "Pack and label" });
    source = insertActivityNote(source, parseActivity(source), { placement: "right", text: "Warehouse\noperation", color: "Wheat" });
    document = parseActivity(source);
    source = updateActivityNote(source, document.notes[0]!, { placement: "left", text: "Internal" });
    expect(source).toContain("note left\nInternal\nend note");
    expect(source).toContain("' keep me");
    document = parseActivity(source);
    source = deleteActivityNode(source, document.nodes.find((item) => item.kind === "action")!);
    expect(source).not.toContain("Pack and label");
    expect(source).toContain("' keep me");
  });
  it("edits controls and arrows and reorders an action with its note", () => {
    let source = "@startuml\nstart\n:A;\nnote right\nA note\nend note\n:B;\nif (Ready?) then (yes)\n-[#Blue,dashed]-> [go]\nendif\nstop\n@enduml";
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
});
