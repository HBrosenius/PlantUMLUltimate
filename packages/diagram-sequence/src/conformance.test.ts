import { describe, expect, it } from "vitest";
import { parseSequence } from "./index";

const TYPE_CATALOG = `@startuml
actor User
boundary Web
control API
entity Session
database Store
collections Cache
queue Events
participant Worker
User -> Web: solid
Web --> API: dotted
API ->> Events: open
Events ->x Worker: lost head
Worker o-> Cache: circle source
[-> User: incoming
Store ->]: outgoing
?-> API: found
API ->?: lost
alt#Gold #LightBlue accepted
API -> Store ++: save
else #Pink rejected
API --> User: error
end
opt optional
end
loop retries
end
par first
else second
end
break abort
end
critical transaction
end
group processing [internal]
end
activate API #LightBlue
deactivate API
destroy Worker
note left: floating
hnote right of API: hexagonal
rnote over User, API
multiline
end note
ref over User, Store
external flow
end ref
== phase ==
...delay...
||30||
box "Backend" #AliceBlue
participant Internal
end box
create control Dynamic
return complete
newpage continuation
autonumber 10 5 "000"
autonumber stop
@enduml`;

describe("Sequence type catalog conformance", () => {
  it("recognizes every supported participant and interaction family in one document", () => {
    const document = parseSequence(TYPE_CATALOG);
    expect(new Set(document.participants.map((item) => item.kind))).toEqual(
      new Set(["actor", "boundary", "control", "entity", "database", "collections", "queue", "participant"]),
    );
    expect(document.messages).toHaveLength(11);
    expect(
      document.messages.filter((item) => item.from === "[" || item.to === "]" || item.from === "?" || item.to === "?"),
    ).toHaveLength(4);
    expect(new Set(document.fragments.map((item) => item.kind))).toEqual(
      new Set(["alt", "opt", "loop", "par", "break", "critical", "group"]),
    );
  });

  it("recognizes every supported annotation, lifecycle, grouping, and timeline family", () => {
    const document = parseSequence(TYPE_CATALOG);
    expect(new Set(document.notes.map((item) => item.shape))).toEqual(new Set(["note", "hnote", "rnote"]));
    expect(new Set(document.activations.map((item) => item.kind))).toEqual(
      new Set(["activate", "deactivate", "destroy"]),
    );
    expect(document.references).toMatchObject([{ multiline: true, participants: ["User", "Store"] }]);
    expect(new Set(document.timelineItems.map((item) => item.kind))).toEqual(
      new Set(["separator", "delay", "space", "return", "newpage"]),
    );
    expect(document.boxes).toMatchObject([{ label: "Backend", participants: ["Internal"] }]);
    expect(document.creations).toMatchObject([{ participantKind: "control", participant: "Dynamic" }]);
    expect(document.autonumbers).toMatchObject([{ command: "start" }, { command: "stop" }]);
  });
});
