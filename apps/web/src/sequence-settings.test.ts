import { describe, expect, it } from "vitest";
import { parseSequenceSettings, updateSequenceSettings } from "./sequence-settings";

describe("Sequence settings", () => {
  it("parses presentation, visibility, activation, and numbering settings", () => {
    expect(parseSequenceSettings('@startuml\ntitle Checkout\nheader Internal\nfooter %page%\nautoactivate on\nhide footbox\nhide unlinked\nautonumber 10 5 "000"\n@enduml')).toMatchObject({ title: "Checkout", header: "Internal", footer: "%page%", autoactivate: true, hideFootbox: true, hideUnlinked: true, autonumber: true, autonumberStart: "10", autonumberIncrement: "5", autonumberFormat: "000" });
  });

  it("updates managed settings while preserving messages and flow numbering controls", () => {
    const source = "@startuml\ntitle Old\nautonumber 1\nA -> B: Request\nautonumber stop\nA --> B: Quiet\nautonumber resume\n@enduml";
    const updated = updateSequenceSettings(source, { ...parseSequenceSettings(source), title: "New", hideFootbox: true, autonumberStart: "10", autonumberIncrement: "2", autonumberFormat: "00" });
    expect(updated).toContain('title New\nhide footbox\nautonumber 10 2 "00"');
    expect(updated).toContain("A -> B: Request\nautonumber stop");
    expect(updated).toContain("autonumber resume");
    expect(updated).not.toContain("title Old");
  });

  it("round-trips Sequence layout controls", () => {
    const source = "@startuml\n!pragma teoz true\nskinparam sequenceMessageAlign center\nskinparam responseMessageBelowArrow true\nskinparam maxMessageSize 80\nskinparam ParticipantPadding 24\nskinparam BoxPadding 12\nA -> B: Long message\n@enduml";
    const parsed = parseSequenceSettings(source);
    expect(parsed).toMatchObject({ teoz: true, messageAlignment: "center", responseBelowArrow: true, maxMessageSize: "80", participantPadding: "24", boxPadding: "12" });
    const updated = updateSequenceSettings(source, { ...parsed, messageAlignment: "right", maxMessageSize: "60" });
    expect(updated).toContain("!pragma teoz true\nskinparam sequenceMessageAlign right\nskinparam responseMessageBelowArrow true\nskinparam maxMessageSize 60\nskinparam ParticipantPadding 24\nskinparam BoxPadding 12");
    expect(updated).toContain("A -> B: Long message");
  });

  it("round-trips the Sequence visual palette", () => {
    const source = "@startuml\nskinparam sequenceArrowColor #2563EB\nskinparam sequenceParticipantBackgroundColor #EFF6FF\nskinparam sequenceParticipantBorderColor #1D4ED8\nskinparam sequenceLifeLineBorderColor #64748B\nskinparam noteBackgroundColor #FEF3C7\nskinparam noteBorderColor #D97706\nskinparam sequenceGroupBorderColor #7C3AED\nA -> B\n@enduml";
    const parsed = parseSequenceSettings(source);
    expect(parsed).toMatchObject({ arrowColor: "#2563EB", participantBackgroundColor: "#EFF6FF", participantBorderColor: "#1D4ED8", lifelineColor: "#64748B", noteBackgroundColor: "#FEF3C7", noteBorderColor: "#D97706", groupBorderColor: "#7C3AED" });
    expect(updateSequenceSettings(source, { ...parsed, arrowColor: "#DC2626" })).toContain("skinparam sequenceArrowColor #DC2626");
  });
});
