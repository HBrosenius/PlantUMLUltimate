import { describe, expect, it } from "vitest";
import {
  deleteActivityNode,
  insertActivityAction,
  insertActivityNote,
  insertActivityPartition,
  parseActivity,
  updateActivityAction,
  updateActivityNote,
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
});
