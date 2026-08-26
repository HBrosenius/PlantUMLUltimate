import { describe, expect, it } from "vitest";
import { findActivityObjectAt, parseActivity } from "./index";

describe("activity parser", () => {
  it("parses actions, decisions, loops, forks, partitions, arrows, and notes", () => {
    const source = `@startuml
start
partition "Checkout" #LightBlue {
  #PaleGreen:Validate cart; <<service>>
  if (Stock available?) then (yes)
    :Reserve stock;
  else (no)
    :Show error;
  endif
  fork
    :Charge card;
  fork again
    :Create shipment;
  end fork
  repeat
    :Poll provider;
  repeat while (Pending?) is (yes)
  -[#Blue,dashed]-> [complete]
  note right #Wheat
  External call
  end note
}
stop
@enduml`;
    const document = parseActivity(source);
    expect(document.nodes.map((item) => item.kind)).toEqual([
      "start", "action", "action", "action", "action", "action", "action", "stop",
    ]);
    expect(document.nodes[1]).toMatchObject({ label: "Validate cart", color: "#PaleGreen", stereotype: "service", partitionId: "checkout" });
    expect(document.controls.map((item) => item.kind)).toEqual([
      "if", "else", "endif", "fork", "fork-again", "end-fork", "repeat", "repeat-while",
    ]);
    expect(document.controls[1]).toMatchObject({ label: "no" });
    expect(document.arrows[0]).toMatchObject({ label: "complete", color: "#Blue", lineStyle: "dashed" });
    expect(document.notes[0]).toMatchObject({ targetId: "control-7", text: "External call", color: "#Wheat" });
    expect(document.diagnostics).toHaveLength(0);
    expect(findActivityObjectAt(document, source.indexOf("Reserve stock"))?.id).toBe("action-1");
  });

  it("diagnoses unclosed structures without dropping unknown source", () => {
    const document = parseActivity("@startuml\nwhile (More?)\n:Work;\ncustom command\n@enduml");
    expect(document.diagnostics).toContainEqual(expect.objectContaining({ code: "unterminated-control" }));
    expect(document.unknown[0]?.text).toBe("custom command");
  });
});
