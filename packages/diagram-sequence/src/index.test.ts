import { describe, expect, it } from "vitest";
import {
  deleteSequenceMessage,
  deleteSequenceParticipant,
  deleteSequenceStructure,
  insertSequenceMessage,
  insertSequenceParticipant,
  insertSequenceParticipantBox,
  insertSequenceStructure,
  parseSequence,
  renameSequenceAnchor,
  reconnectSequenceStructure,
  reorderSequenceStatement,
  sequenceParticipantOccurrences,
  updateSequenceMessage,
  updateSequenceParticipant,
  updateSequenceStructure,
} from "./index";

describe("parseSequence", () => {
  it("collects and renames message anchor declarations and duration references", () => {
    const source =
      "@startuml\n{request} Alice -> Bob: Call\n{request} <-> {response}: 1s\n{response} Bob --> Alice: Done\n@enduml";
    const document = parseSequence(source);
    const occurrences = sequenceParticipantOccurrences(source, document).filter(
      (item) => item.kind === "sequence-anchor" && item.key === "request",
    );
    expect(occurrences.map((item) => item.role)).toEqual(["declaration", "reference"]);
    expect(renameSequenceAnchor(source, document, "request", "call-start")).toContain("{call-start} <-> {response}");
  });
  it("parses typed participants and messages with source ranges", () => {
    const source = '@startuml\nactor "API User" as User #red\ndatabase Store\nUser --> Store: Load\n@enduml';
    const document = parseSequence(source);
    expect(document.participants).toMatchObject([
      { kind: "actor", label: "API User", alias: "User", color: "#red" },
      { kind: "database", label: "Store" },
    ]);
    expect(document.messages).toMatchObject([{ from: "User", to: "Store", arrow: "-->", label: "Load" }]);
    expect(source.slice(document.messages[0]!.sourceRange.from, document.messages[0]!.sourceRange.to)).toBe(
      "User --> Store: Load",
    );
  });

  it("parses participant stereotypes, spots, display order, and colors", () => {
    const source =
      '@startuml\nparticipant "Order API" as API <<(S,#ADD1B2) Service>> order 20 #LightBlue\nactor User <<Human>> order 10\n@enduml';
    expect(parseSequence(source).participants).toMatchObject([
      {
        label: "Order API",
        alias: "API",
        stereotype: "Service",
        spotCharacter: "S",
        spotColor: "#ADD1B2",
        order: 20,
        color: "#LightBlue",
      },
      { kind: "actor", label: "User", stereotype: "Human", order: 10 },
    ]);
  });
});

describe("Sequence source operations", () => {
  it("finds semantic participant declarations and references without matching message text", () => {
    const source =
      '@startuml\nactor "API User" as User\ndatabase Store\nUser -> Store: User sees Store\nactivate User\nnote right of User: Store is ready\nref over User, Store: Review\ncreate participant User\n@enduml';
    const occurrences = sequenceParticipantOccurrences(source, parseSequence(source));

    expect(occurrences.filter((item) => item.key === "user").map((item) => item.value)).toEqual([
      "API User",
      "User",
      "User",
      "User",
      "User",
      "User",
      "User",
    ]);
    expect(occurrences.filter((item) => item.key === "store")).toHaveLength(3);
    expect(occurrences.map((item) => source.slice(item.range.from, item.range.to))).toEqual(
      occurrences.map((item) => item.value),
    );
  });

  it("inserts participants and messages before @enduml", () => {
    let source = "@startuml\n@enduml";
    source = insertSequenceParticipant(source, { kind: "boundary", label: "Web UI", alias: "UI" });
    source = insertSequenceMessage(source, { from: "User", to: "UI", arrow: "->", label: "Open" });
    expect(source).toBe('@startuml\nboundary "Web UI" as UI\nUser -> UI: Open\n@enduml');
  });

  it("inserts rich participant declarations in canonical form", () => {
    const source = insertSequenceParticipant("@startuml\n@enduml", {
      kind: "control",
      label: "Order API",
      alias: "API",
      stereotype: "Service",
      spotCharacter: "S",
      spotColor: "#ADD1B2",
      order: 20,
      color: "#LightBlue",
    });
    expect(source).toContain('control "Order API" as API <<(S,#ADD1B2) Service>> order 20 #LightBlue');
  });

  it("renames a participant and its message references", () => {
    const source =
      "@startuml\nparticipant Customer as User\nparticipant API\nUser -> API ++: Request\nAPI --> User: Response\n@enduml";
    const document = parseSequence(source);
    const updated = updateSequenceParticipant(source, document, document.participants[0]!, {
      kind: "actor",
      label: "Customer",
      alias: "Client",
      color: "#blue",
    });
    expect(updated).toContain("actor Customer as Client #blue");
    expect(updated).toContain("Client -> API ++: Request");
    expect(updated).toContain("API --> Client: Response");
  });

  it("renames participant references in notes, references, activations, and creation directives", () => {
    const source =
      "@startuml\nparticipant API\nactivate API\nnote over API: Working\nref over API: Other flow\ncreate control API\n@enduml";
    const document = parseSequence(source);
    const updated = updateSequenceParticipant(source, document, document.participants[0]!, {
      kind: "participant",
      label: "Service",
      alias: "Svc",
      stereotype: "Backend",
      order: 5,
    });
    expect(updated).toContain("participant Service as Svc <<Backend>> order 5");
    expect(updated).toContain("activate Svc");
    expect(updated).toContain("note over Svc: Working");
    expect(updated).toContain("ref over Svc: Other flow");
    expect(updated).toContain("create control Svc");
  });

  it("updates and deletes messages without rewriting neighbours", () => {
    const source = "@startuml\nA -> B: First\nB --> A: Second\n@enduml";
    const document = parseSequence(source);
    const updated = updateSequenceMessage(source, document.messages[0]!, {
      from: "A",
      to: "A",
      arrow: "->",
      modifiers: "++",
      label: "Self",
    });
    expect(updated).toContain("A -> A ++: Self\nB --> A: Second");
    expect(deleteSequenceMessage(updated, parseSequence(updated).messages[0]!)).toContain("B --> A: Second");
  });

  it("parses and round-trips incoming, outgoing, found, lost, and styled arrows", () => {
    const source =
      "@startuml\n[-> A: Incoming\nA ->]: Outgoing\n?-> A: Found\nA ->?: Lost\nA -[#red,dashed]-> B: Styled\nA o\\--x B: Custom\n@enduml";
    const document = parseSequence(source);
    expect(document.messages).toMatchObject([
      { from: "[", to: "A", arrow: "->", label: "Incoming" },
      { from: "A", to: "]", arrow: "->", label: "Outgoing" },
      { from: "?", to: "A", arrow: "->", label: "Found" },
      { from: "A", to: "?", arrow: "->", label: "Lost" },
      { from: "A", to: "B", arrow: "-[#red,dashed]->", label: "Styled" },
      { from: "A", to: "B", arrow: "o\\--x", label: "Custom" },
    ]);
    const changed = updateSequenceMessage(source, document.messages[0]!, {
      from: "[",
      to: "B",
      arrow: "-->",
      label: "Changed",
    });
    expect(changed).toContain("[--> B: Changed");
    expect(insertSequenceMessage("@startuml\n@enduml", { from: "A", to: "]", arrow: "->", label: "Edge" })).toContain(
      "A ->]: Edge",
    );
  });

  it("deletes a participant together with connected messages", () => {
    const source = "@startuml\nparticipant A\nparticipant B\nA -> B: Connected\nparticipant C\nC -> C: Keep\n@enduml";
    const document = parseSequence(source);
    const updated = deleteSequenceParticipant(source, document, document.participants[0]!);
    expect(updated).not.toContain("participant A");
    expect(updated).not.toContain("Connected");
    expect(updated).toContain("C -> C: Keep");
  });

  it("reorders declarations and messages as whole source lines", () => {
    const source = "@startuml\nparticipant A\nparticipant B\nA -> B: First\nB -> A: Second\n@enduml";
    let document = parseSequence(source);
    const participantsReordered = reorderSequenceStatement(
      source,
      document.participants[1]!,
      document.participants[0]!,
    );
    expect(participantsReordered).toContain("participant B\nparticipant A");
    document = parseSequence(participantsReordered);
    const messagesReordered = reorderSequenceStatement(
      participantsReordered,
      document.messages[1]!,
      document.messages[0]!,
    );
    expect(messagesReordered).toContain("B -> A: Second\nA -> B: First");

    document = parseSequence(participantsReordered);
    const movedToBottom = reorderSequenceStatement(
      participantsReordered,
      document.participants[0]!,
      document.participants[1]!,
      "after",
    );
    expect(movedToBottom).toContain("participant A\nparticipant B");
  });

  it("parses fragments, activations, notes, separators, delays, and spaces", () => {
    const source =
      "@startuml\nalt Success\nactivate API #red\nnote over User, API #yellow: Working\n== Phase 2 ==\n...later...\n||40||\nend\n@enduml";
    const document = parseSequence(source);
    expect(document.fragments).toMatchObject([{ kind: "alt", label: "Success" }]);
    expect(document.activations).toMatchObject([{ kind: "activate", participant: "API", color: "#red" }]);
    expect(document.notes).toMatchObject([
      { placement: "over", participants: ["User", "API"], color: "#yellow", text: "Working" },
    ]);
    expect(document.timelineItems).toMatchObject([
      { kind: "separator", label: "Phase 2" },
      { kind: "delay", label: "later" },
      { kind: "space", label: "40" },
    ]);
  });

  it("inserts structured Sequence constructs before @enduml", () => {
    let source = "@startuml\nparticipant User\nparticipant API\n@enduml";
    source = insertSequenceStructure(source, {
      kind: "fragment",
      fragmentKind: "alt",
      label: "Success",
      elseLabel: "Failure",
    });
    source = insertSequenceStructure(source, {
      kind: "activation",
      action: "activate",
      participant: "API",
      color: "#red",
    });
    source = insertSequenceStructure(source, {
      kind: "note",
      placement: "over",
      participants: ["User", "API"],
      text: "Working",
    });
    expect(source).toContain("alt Success\nelse Failure\nend");
    expect(source).toContain("activate API #red");
    expect(source).toContain("note over User, API: Working");
  });

  it("tracks balanced fragment ranges and edits or deletes the complete block safely", () => {
    const source = "@startuml\nalt Success\nloop Retry\nA -> B: Work\nend\nelse Failure\nB -> A: Error\nend\n@enduml";
    const document = parseSequence(source);
    expect(source.slice(document.fragments[0]!.sourceRange.from, document.fragments[0]!.sourceRange.to)).toContain(
      "B -> A: Error\nend",
    );
    const renamed = updateSequenceStructure(source, document.fragments[0]!, {
      kind: "fragment",
      fragmentKind: "critical",
      label: "Must succeed",
    });
    expect(renamed).toContain("critical Must succeed\nloop Retry");
    expect(renamed).not.toContain("else Failure");
    const withoutNested = deleteSequenceStructure(source, document.fragments[1]!);
    expect(withoutNested).not.toContain("loop Retry");
    expect(withoutNested).not.toContain("A -> B: Work");
    expect(withoutNested).toContain("else Failure");
  });

  it("parses and edits fragment colors, branch colors, and secondary group labels without losing bodies", () => {
    const source =
      "@startuml\nalt#Gold #LightBlue Success\nA -> B: Primary\nelse #Pink Failure\nloop Retry\nB -> A: Nested\nend\nelse #Orange Timeout\nA -> B: Final\nend\ngroup Processing [Internal work]\nA -> B: Grouped\nend\n@enduml";
    const document = parseSequence(source);
    expect(document.fragments[0]).toMatchObject({
      headerColor: "#Gold",
      backgroundColor: "#LightBlue",
      label: "Success",
      branches: [
        { color: "#Pink", label: "Failure" },
        { color: "#Orange", label: "Timeout" },
      ],
    });
    expect(document.fragments[2]).toMatchObject({
      kind: "group",
      label: "Processing",
      secondaryLabel: "Internal work",
    });
    const updated = updateSequenceStructure(source, document.fragments[0]!, {
      kind: "fragment",
      fragmentKind: "alt",
      label: "Accepted",
      headerColor: "#Blue",
      backgroundColor: "#AliceBlue",
      branches: [{ label: "Rejected", color: "#Red" }, { label: "Expired", color: "#Gray" }, { label: "Fallback" }],
    });
    expect(updated).toContain("alt#Blue #AliceBlue Accepted");
    expect(updated).toContain("else #Red Rejected");
    expect(updated).toContain("else #Gray Expired");
    expect(updated).toContain("else Fallback");
    expect(updated).toContain("A -> B: Primary");
    expect(updated).toContain("B -> A: Nested");
    expect(updated).toContain("A -> B: Final");
  });

  it("parses references, participant boxes, and autonumber commands", () => {
    const source =
      '@startuml\nbox "Backend" #LightBlue\nparticipant API\ndatabase DB\nend box\nref #Yellow over API, DB: Persist\nautonumber 10 10 "000"\nautonumber stop\n@enduml';
    const document = parseSequence(source);
    expect(document.boxes).toMatchObject([{ label: "Backend", color: "#LightBlue", participants: ["API", "DB"] }]);
    expect(document.references).toMatchObject([{ participants: ["API", "DB"], color: "#Yellow", text: "Persist" }]);
    expect(document.autonumbers).toMatchObject([{ command: "start" }, { command: "stop" }]);
  });

  it("parses return, creation, page breaks, and balanced multi-line notes", () => {
    const source =
      "@startuml\ncreate control Worker\nA -> Worker: Start\nnote over A, Worker #Yellow\nFirst line\nSecond line\nend note\nreturn Complete\nnewpage Retry flow\n@enduml";
    const document = parseSequence(source);
    expect(document.creations).toMatchObject([{ participantKind: "control", participant: "Worker" }]);
    expect(document.timelineItems).toMatchObject([
      { kind: "return", label: "Complete" },
      { kind: "newpage", label: "Retry flow" },
    ]);
    expect(document.notes).toMatchObject([
      { placement: "over", participants: ["A", "Worker"], color: "#Yellow", text: "First line\nSecond line" },
    ]);
    expect(source.slice(document.notes[0]!.sourceRange.from, document.notes[0]!.sourceRange.to)).toContain("end note");
  });

  it("round-trips note shapes, aligned notes, formatting, and multiline references", () => {
    const source =
      "@startuml\nparticipant A\nparticipant B\nhnote right of A #Yellow: **Important** [[https://example.com link]]\n/ rnote over A, B\nLine one\n<i>Line two</i>\nend note\nref #LightBlue over A, B\nExternal flow\nwith details\nend ref\n@enduml";
    const document = parseSequence(source);
    expect(document.notes).toMatchObject([
      { shape: "hnote", aligned: false, placement: "right of", text: "**Important** [[https://example.com link]]" },
      { shape: "rnote", aligned: true, placement: "over", participants: ["A", "B"], text: "Line one\n<i>Line two</i>" },
    ]);
    expect(document.references).toMatchObject([
      { multiline: true, color: "#LightBlue", participants: ["A", "B"], text: "External flow\nwith details" },
    ]);
    const noteUpdated = updateSequenceStructure(source, document.notes[0]!, {
      kind: "note",
      shape: "rnote",
      aligned: true,
      placement: "left",
      participants: [],
      text: "[[https://openai.com OpenAI]]",
    });
    expect(noteUpdated).toContain("/ rnote left: [[https://openai.com OpenAI]]");
    const refUpdated = updateSequenceStructure(source, parseSequence(source).references[0]!, {
      kind: "reference",
      participants: ["B"],
      text: "First\nSecond",
      multiline: true,
    });
    expect(refUpdated).toContain("ref over B\nFirst\nSecond\nend ref");
  });

  it("parses and edits Teoz message anchors and duration arrows", () => {
    let source =
      "@startuml\n!pragma teoz true\n{start} A -> B: Begin\n{finish} B --> A: End\n{start} <-> {finish}: elapsed\n@enduml";
    let document = parseSequence(source);
    expect(document.messages).toMatchObject([
      { anchor: "start", from: "A", to: "B" },
      { anchor: "finish", from: "B", to: "A" },
    ]);
    expect(document.durations).toMatchObject([
      { fromAnchor: "start", toAnchor: "finish", arrow: "<->", label: "elapsed" },
    ]);
    source = updateSequenceMessage(source, document.messages[0]!, {
      from: "A",
      to: "B",
      arrow: "->",
      label: "Changed",
      anchor: "opened",
    });
    expect(source).toContain("{opened} A -> B: Changed");
    document = parseSequence(source);
    const updated = updateSequenceStructure(source, document.durations[0]!, {
      kind: "duration",
      fromAnchor: "opened",
      toAnchor: "finish",
      arrow: "<-->",
      label: "total time",
    });
    expect(updated).toContain("{opened} <--> {finish}: total time");
  });

  it("inserts and edits return, creation, page breaks, and multi-line notes", () => {
    let source = "@startuml\nparticipant A\n@enduml";
    source = insertSequenceStructure(source, { kind: "create", participantKind: "database", participant: "Store" });
    source = insertSequenceStructure(source, {
      kind: "note",
      placement: "over",
      participants: ["A", "Store"],
      text: "Line one\nLine two",
    });
    source = insertSequenceStructure(source, { kind: "return", label: "Done" });
    source = insertSequenceStructure(source, { kind: "newpage", label: "Next" });
    expect(source).toContain("create database Store");
    expect(source).toContain("note over A, Store\nLine one\nLine two\nend note");
    expect(source).toContain("return Done\nnewpage Next");
    const document = parseSequence(source);
    const updated = updateSequenceStructure(source, document.notes[0]!, {
      kind: "note",
      placement: "right",
      participants: ["Store"],
      text: "Single line",
    });
    expect(updated).toContain("note right Store: Single line");
    expect(updated).not.toContain("Line two");
  });

  it("wraps existing declarations in a participant box without duplicating them", () => {
    const source = "@startuml\nactor User\nparticipant API\ndatabase DB\nUser -> API: Call\n@enduml";
    const updated = insertSequenceParticipantBox(source, parseSequence(source), {
      kind: "box",
      label: "Services",
      participants: ["API", "DB"],
      color: "#LightBlue",
    });
    expect(updated).toContain("box Services #LightBlue\nparticipant API\ndatabase DB\nend box");
    expect(updated.match(/participant API/g)).toHaveLength(1);
    expect(updated).toContain("User -> API: Call");
  });

  it("inserts and updates references and autonumber commands", () => {
    let source = "@startuml\nparticipant A\nparticipant B\n@enduml";
    source = insertSequenceStructure(source, {
      kind: "reference",
      participants: ["A", "B"],
      text: "Other flow",
      color: "#Yellow",
    });
    source = insertSequenceStructure(source, {
      kind: "autonumber",
      command: "start",
      start: 10,
      increment: 5,
      format: "000",
    });
    expect(source).toContain("ref #Yellow over A, B: Other flow");
    expect(source).toContain('autonumber 10 5 "000"');
    const document = parseSequence(source);
    const changed = updateSequenceStructure(source, document.references[0]!, {
      kind: "reference",
      participants: ["B"],
      text: "Changed",
    });
    expect(changed).toContain("ref over B: Changed");
  });

  it("reconnects participant-bound structures without losing their presentation", () => {
    let source =
      "@startuml\nparticipant A\nparticipant B\nparticipant C\nnote over A, B #Yellow: Shared\nref #LightBlue over A, B: Other flow\nactivate A #Red\ncreate control B\n@enduml";
    let document = parseSequence(source);
    source = reconnectSequenceStructure(source, document.notes[0]!, 1, "C");
    document = parseSequence(source);
    source = reconnectSequenceStructure(source, document.references[0]!, 0, "C");
    document = parseSequence(source);
    source = reconnectSequenceStructure(source, document.activations[0]!, 0, "B");
    document = parseSequence(source);
    source = reconnectSequenceStructure(source, document.creations[0]!, 0, "C");
    expect(source).toContain("note over A, C #Yellow: Shared");
    expect(source).toContain("ref #LightBlue over C, B: Other flow");
    expect(source).toContain("activate B #Red");
    expect(source).toContain("create control C");
  });
});
