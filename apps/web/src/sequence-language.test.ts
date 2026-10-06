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

describe("Sequence message arrow validation", () => {
  it.each(["\n", "\r\n"])("repairs the missing arrowhead with %j line endings", (newline) => {
    const source = [
      "@startuml",
      "skinparam guillemet false",
      'participant "Famous Bob" as Bob << Generated >>',
      "participant Alice << (C,#ADD1B2) Testable >>",
      "Bob-Alice: First message",
      "@enduml",
    ].join(newline);
    expect(sequenceDiagnostics(source).map((item) => item.message)).toEqual([
      "Sequence message arrow is missing an arrowhead",
    ]);
    const [fix] = sequenceQuickFixes(source);
    expect(fix).toBeDefined();
    const repaired = source.slice(0, fix!.from) + fix!.replacement + source.slice(fix!.to);
    expect(repaired).toBe(source.replace("Bob-Alice", "Bob->Alice"));
    expect(sequenceDiagnostics(repaired)).toEqual([]);
  });

  it.each(["->", "-->", "<-", "<--", "<->", "->>", "-\\", "-/", "->x", "o->", "-[#red]>"])(
    "preserves valid compact arrow %s",
    (arrow) => {
      expect(sequenceDiagnostics(`@startuml\nBob${arrow}Alice: First message\n@enduml`)).toEqual([]);
    },
  );

  it("repairs dashed arrows and quoted endpoints", () => {
    const source = '@startuml\n"Famous Bob" -- "Alice Smith": Call\n@enduml';
    expect(sequenceQuickFixes(source).map((fix) => fix.replacement)).toEqual(["-->"]);
  });

  it("ignores message-like prose inside notes, references, comments, and titles", () => {
    const source =
      "@startuml\nBob -> Alice: Init\nnote over Bob\nBob-Alice: prose\nend note\nref over Bob\nBob-Alice: prose\nend ref\n/'\nBob-Alice: comment\n'/\ntitle\nBob-Alice: title\nendtitle\n@enduml";
    expect(sequenceDiagnostics(source)).toEqual([]);
  });

  it("does not offer block closers for semantic errors", () => {
    expect(sequenceQuickFixes("@startuml\nparticipant Bob\nactivate Ghost\n@enduml")).toEqual([]);
  });
});

describe("Sequence keyword typos", () => {
  it.each([
    ["participan", "participant", "Alice << (C,#ADD1B2) Testable >>"],
    ["particpant", "participant", '"Famous Bob" as Bob << Generated >>'],
    ["particiapnt", "participant", "Alice"],
    ["participantt", "participant", "Alice"],
    ["skinparm", "skinparam", "guillemet false"],
    ["skniparam", "skinparam", "guillemet false"],
    ["skinpram", "skinparam", "backgroundColor #white"],
  ])("suggests %s → %s", (typo, keyword, argument) => {
    const source = `@startuml\n  ${typo} ${argument}\nBob->Alice: First message\n@enduml`;
    const diagnostic = sequenceDiagnostics(source).find((item) => item.message.startsWith("Unknown Sequence keyword"));
    expect(diagnostic).toBeDefined();
    expect(source.slice(diagnostic!.from, diagnostic!.to)).toBe(typo);
    const fix = sequenceQuickFixes(source).find((item) => item.replacement === keyword)!;
    expect(fix).toBeDefined();
    expect(sequenceDiagnostics(source.slice(0, fix.from) + fix.replacement + source.slice(fix.to))).toEqual([]);
  });

  it("ignores identifiers, messages, comments, notes, and style properties", () => {
    const source =
      "@startuml\nparticipant participan\nparticipan -> Bob: skinparm guillemet false\nBob->participan: participan Alice\n' participan Alice\nnote over Bob\nparticipan Alice\nend note\nskinparam sequence {\n  skinparm false\n}\n<style>\nparticipan Alice\n</style>\n@enduml";
    expect(sequenceDiagnostics(source)).toEqual([]);
  });
});
