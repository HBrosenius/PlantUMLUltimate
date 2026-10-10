import { describe, expect, it } from "vitest";
import { formatSource } from "./source-format";
import {
  DEFAULT_ACTIVITY_SOURCE,
  DEFAULT_CLASS_SOURCE,
  DEFAULT_COMPONENT_SOURCE,
  DEFAULT_SEQUENCE_SOURCE,
  DEFAULT_USECASE_SOURCE,
  DEFAULT_SOURCE,
  type DiagramKind,
} from "./model";
import { parseClassDiagram } from "@plantuml-studio/diagram-class";
import { parseGantt } from "@plantuml-studio/diagram-gantt";

const classSource = `  @startuml  
package "Orders" {
class Order {
-id: UUID
    +submit(): void
 }
   }
 Order --> Item : retains  spacing  
 @enduml`;
const expectedClass = `@startuml
package "Orders" {
  class Order {
    -id: UUID
    +submit(): void
  }
}
Order --> Item : retains  spacing  
@enduml`;

describe("conservative formatting", () => {
  it("indents nested blocks without rewriting members, labels or arrows", () => {
    const result = formatSource("class", classSource);
    expect(result.reason).toBeUndefined();
    expect(result.source).toBe(expectedClass);
    const before = parseClassDiagram(classSource),
      after = parseClassDiagram(result.source);
    expect(after.entities.map((e) => [e.label, e.members.map((m) => m.text)])).toEqual(
      before.entities.map((e) => [e.label, e.members.map((m) => m.text)]),
    );
    expect(after.relationships.map((r) => [r.from, r.to, r.label, r.kind])).toEqual(
      before.relationships.map((r) => [r.from, r.to, r.label, r.kind]),
    );
  });
  it.each(["\n", "\r\n"])("is idempotent and retains %j line endings", (newline) => {
    const source = classSource.replaceAll("\n", newline);
    const result = formatSource("class", source);
    expect(result.source).toBe(expectedClass.replaceAll("\n", newline));
    expect(formatSource("class", result.source)).toMatchObject({ source: result.source, changes: [] });
  });
  it("preserves comment and multiline note/title bytes and blank lines", () => {
    const protectedText = `  ' comment with trailing spaces  
/' block comment
   deliberately spaced  
'/
note right of A
  label with  spaces  
\tsecond line
end note
title
  multiline title  
end title
  `;
    const source = `@startuml\n participant A\n${protectedText}\n   participant B\n A -> B: message  \n@enduml`;
    const result = formatSource("sequence", source);
    expect(result.reason).toBeUndefined();
    expect(result.source).toContain(protectedText);
    expect(result.source).toContain("A -> B: message  ");
  });
  it("indents sequence branches without changing control-flow text", () => {
    const source =
      "@startuml\nparticipant A\nparticipant B\nalt yes\nA -> B: one\nloop 3\n B --> A: two\nend\nelse no\nA -> B: three\nend\n@enduml";
    const result = formatSource("sequence", source);
    expect(result.reason).toBeUndefined();
    expect(result.source).toContain(
      "alt yes\n  A -> B: one\n  loop 3\n    B --> A: two\n  end\nelse no\n  A -> B: three\nend",
    );
  });
  it("normalizes supported Gantt leading whitespace without changing scheduling", () => {
    const source =
      " @startgantt\n  Project starts 2026-10-01\n\t[A] starts 2026-10-02\n    [A] lasts 3 days\n @endgantt";
    const result = formatSource("gantt", source);
    expect(result.changes.length).toBe(5);
    expect(parseGantt(result.source).document.tasks.map((t) => [t.label, t.start?.value, t.duration?.value])).toEqual(
      parseGantt(source).document.tasks.map((t) => [t.label, t.start?.value, t.duration?.value]),
    );
  });
  it("preserves WBS prefixes/labels byte-for-byte", () => {
    const body = "  * Root  \n\t** Child  ";
    const result = formatSource("wbs", ` @startwbs\n${body}\n @endwbs`);
    expect(result.source).toBe(`@startwbs\n${body}\n@endwbs`);
  });
  it.each([
    ["class", "@startuml\n!include other.puml\n class A\n@enduml"],
    ["class", "@startuml\n!define ENTITY(x) class x\n ENTITY(A)\n@enduml"],
    ["class", "@startuml\n<style>\nclass {\n}\n</style>\n class A\n@enduml"],
    ["class", "@startuml\n class A { +field }\n@enduml"],
    ["sequence", "@startuml\n participant A\nstrange unknown syntax\n@enduml"],
    ["sequence", '@startuml\n participant "line one\nline two" as A\n@enduml'],
    ["sequence", "@startuml\n participant A \\\nparticipant B\n@enduml"],
    ["sequence", "@startuml\n alt yes\n A -> B\n@enduml"],
    ["sequence", "@startuml\n note right of A\nmissing end\n@enduml"],
    ["gantt", "@startgantt\n  [A] strange unknown syntax\n@endgantt"],
    ["class", "@startuml\n  A extra -- extra B\n@enduml"],
    ["class", "@startuml\n  class A extra unknown\n@enduml"],
    ["activity", DEFAULT_ACTIVITY_SOURCE],
  ] as const)("withholds %s unsupported source atomically", (kind, source) => {
    const result = formatSource(kind, source);
    expect(result.source).toBe(source);
    expect(result.changes).toEqual([]);
    expect(result.reason).toBeTruthy();
  });
  it.each([
    ["class", DEFAULT_CLASS_SOURCE],
    ["component", DEFAULT_COMPONENT_SOURCE],
    ["usecase", DEFAULT_USECASE_SOURCE],
    ["sequence", DEFAULT_SEQUENCE_SOURCE],
    ["gantt", DEFAULT_SOURCE],
  ] as [DiagramKind, string][])("accepts the canonical %s fixture", (kind, source) => {
    const result = formatSource(kind, source);
    expect(result.source).toBe(source);
    expect(result.reason).toBe("No supported whitespace changes are needed.");
  });
  it("leaves standalone CR source untouched", () => {
    const source = classSource.replaceAll("\n", "\r");
    expect(formatSource("class", source)).toMatchObject({ source, changes: [], reason: expect.stringContaining("CR") });
  });
  it("bounds work for large sources", () => {
    const source = "@startuml\n" + "participant A\n".repeat(5001) + "@enduml";
    expect(formatSource("sequence", source)).toMatchObject({
      source,
      changes: [],
      reason: expect.stringContaining("5,000"),
    });
  });
});

const dependencyExample = `@startgantt

Project starts 2026-10-02
saturday are closed
sunday are closed
today is colored in #AAF

[Architecture] starts 2026-10-02
[Architecture]      lasts 4 days


[Backend] lasts 8 days


[Frontend] lasts 10 days


[Testing] lasts 5 days

[Backend] starts at [Architecture]'s end
[Frontend] starts at [Architecture]'s end
[Testing] starts at [Backend]'s end
[Testing] starts at [Frontend]'s end
@endgantt`;
it("formats the reported task gap while preserving the rest of the dependency example", () => {
  const result = formatSource("gantt", dependencyExample);
  expect(result.source).toBe(dependencyExample.replace("[Architecture]      lasts", "[Architecture] lasts"));
  expect(result.changes).toEqual([
    { line: 9, before: "[Architecture]      lasts 4 days", after: "[Architecture] lasts 4 days" },
  ]);
  expect(formatSource("gantt", result.source).changes).toEqual([]);
});

it.each([
  "starts at [Architecture]'s end",
  "starts at [Architecture]’s start",
  "ends at [Architecture]'s end",
  "ends at [Architecture]'s start",
  "starts 2 days after [Architecture]'s end",
  "ends 1 week before [Architecture]'s start",
])("formats dependency indentation for %s without changing dependency semantics", (statement) => {
  const source = `@startgantt\nProject starts 2026-10-02\n[Architecture] lasts 4 days\n[Backend] lasts 8 days\n    [Backend] ${statement}\n@endgantt`;
  const result = formatSource("gantt", source);
  expect(result.changes).toHaveLength(1);
  expect(result.source).toContain(`\n[Backend] ${statement}\n`);
  const semantics = (value: string) =>
    parseGantt(value).document.dependencies.map((d) => [
      d.predecessorTaskId,
      d.successorTaskId,
      d.relation,
      d.offset?.value,
      d.direction,
    ]);
  expect(semantics(result.source)).toEqual(semantics(source));
  expect(formatSource("gantt", result.source).changes).toEqual([]);
});

it("normalizes task separator tabs without altering task-name or note whitespace", () => {
  const source =
    "@startgantt\nProject starts 2026-10-02\n[Architecture  review]\t  lasts 4 days\nnote bottom\n  Preserve   this note  \nend note\n@endgantt";
  const result = formatSource("gantt", source);
  expect(result.source).toBe(source.replace("[Architecture  review]\t  lasts", "[Architecture  review] lasts"));
  const semantics = (value: string) => parseGantt(value).document.tasks.map((t) => [t.label, t.duration?.value]);
  expect(semantics(result.source)).toEqual(semantics(source));
});
