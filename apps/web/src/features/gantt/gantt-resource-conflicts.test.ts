import { describe, expect, it } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { findResourceConflicts } from "./gantt-resource-conflicts";

describe("findResourceConflicts", () => {
  it("finds overlapping tasks assigned to the same resource", () => {
    const document = parseGantt(`@startgantt
[First] starts 2026-09-01
[First] lasts 5 days
[First] on {Alice}
[Second] starts 2026-09-03
[Second] lasts 2 days
[Second] on {Alice}
[Separate] starts 2026-09-03
[Separate] lasts 2 days
[Separate] on {Bob}
@endgantt`).document;
    expect(findResourceConflicts(document.tasks[0]!, document.tasks)).toEqual(["Second"]);
  });
});
