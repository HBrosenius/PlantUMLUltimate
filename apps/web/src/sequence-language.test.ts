import { describe, expect, it } from "vitest";
import { sequenceDiagnostics, sequenceQuickFixes } from "./sequence-language";

describe("Sequence diagnostics", () => {
  it("balances nested fragments and participant boxes independently", () => {
    expect(
      sequenceDiagnostics(
        "@startuml\nbox Services\nparticipant API\nend box\nalt Ready\nloop Retry\nend\nend\n@enduml",
      ),
    ).toEqual([]);
  });

  it("reports mismatched and unclosed blocks at their source lines", () => {
    const diagnostics = sequenceDiagnostics("@startuml\nbox Services\nalt Ready\nend box\n@enduml");
    expect(diagnostics.map((item) => item.message)).toEqual([
      "Unexpected end box",
      "Unclosed box block",
      "Unclosed alt block",
    ]);
  });

  it("balances note and reference blocks and provides safe closing quick fixes", () => {
    expect(
      sequenceDiagnostics(
        "@startuml\nA -> B: Init\nnote over A\nText\nend note\nref over A, B\nDetails\nend ref\n@enduml",
      ),
    ).toEqual([]);
    const source = "@startuml\nA -> B: Init\nalt Ready\nnote over A\nText\n@enduml";
    expect(sequenceDiagnostics(source).map((item) => item.message)).toEqual([
      "Unclosed alt block",
      "Unclosed note block",
    ]);
    expect(sequenceQuickFixes(source).map((item) => item.replacement)).toEqual(["end\n", "end note\n"]);
  });

  it("reports duplicate participants, missing anchors, and invalid duration arrows", () => {
    const diagnostics = sequenceDiagnostics(
      "@startuml\nparticipant API\ncreate database API\n{start} API -> DB: Call\nactivate Ghost\n{start} nope {finish}: invalid\n{start} <-> {missing}: elapsed\n@enduml",
    );
    expect(diagnostics.map((item) => item.message)).toEqual(
      expect.arrayContaining([
        "Duplicate participant name API",
        "Unknown Sequence participant Ghost",
        "Invalid duration arrow nope",
        "Unknown Sequence anchor missing",
      ]),
    );
  });
});
