import { describe, expect, it } from "vitest";
import { parseGantt } from "./parser";
import { applySourceEdits } from "./source-edits";
import { findTaskAt } from "./model";

describe("parseGantt", () => {
  it("parses horizontal and vertical separators as different model objects", () => {
    const source = "@startgantt\n[A] lasts 2 days\n-- Phase --\nSeparator just at [A]'s start\nSeparator just 3 days before [A]'s end\n@endgantt";
    const document = parseGantt(source).document;
    expect(document.dividers).toHaveLength(1);
    expect(document.verticalSeparators).toEqual([
      expect.objectContaining({ taskLabel: "A", anchor: "start", offset: 0 }),
      expect.objectContaining({ taskLabel: "A", anchor: "end", offset: 3, direction: "before" }),
    ]);
  });
  it("turns simplified then succession into editable dependencies", () => {
    const result = parseGantt(`@startgantt
[Design] requires 3 days
then [Build] as [B] requires 5 days
then [Test] requires 2 days
@endgantt`);
    expect(result.diagnostics).toEqual([]);
    expect(result.document.tasks.map((task) => [task.id, task.label, task.duration?.value])).toEqual([
      ["design", "Design", 3],
      ["b", "Build", 5],
      ["test", "Test", 2],
    ]);
    expect(
      result.document.dependencies.map((dependency) => [dependency.predecessorTaskId, dependency.successorTaskId]),
    ).toEqual([
      ["design", "b"],
      ["b", "test"],
    ]);
  });

  it("reports then when there is no preceding task", () => {
    const result = parseGantt("@startgantt\nthen [Build] requires 2 days\n@endgantt");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "missing-predecessor" }));
  });
  it("parses tasks, dates, durations, dependencies, milestones, and project start", () => {
    const source = `@startgantt
Project starts 2026-09-01
[Design] starts 2026-09-01
[Design] lasts 4 days
[Build] starts at [Design]'s end
[Build] lasts 2 weeks
[Build] is 25% completed
[Build] is colored in Orange
[Release] happens at [Build]'s end
@endgantt`;
    const result = parseGantt(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.document.tasks.map((task) => task.label)).toEqual(["Design", "Build", "Release"]);
    expect(result.document.tasks[0]?.start?.value).toBe("2026-09-01");
    expect(result.document.tasks[0]?.duration?.value).toBe(4);
    expect(result.document.tasks[1]?.duration?.unit).toBe("week");
    expect(result.document.tasks[1]?.completion?.value).toBe(25);
    expect(result.document.tasks[1]?.color?.value).toBe("Orange");
    expect(result.document.dependencies[0]?.relation).toBe("start-after-end");
    expect(result.document.projectStart?.resolved).toBe(true);
  });

  it("classifies end-linked task declarations as end declarations", () => {
    const result = parseGantt(
      "@startgantt\n[A] lasts 2 days\n[B] lasts 2 days\n[B] ends at [A]'s end\n@endgantt",
    );
    expect(result.document.dependencies[0]?.relation).toBe("end-after-end");
    expect(result.document.symbols.tasks.get("b")?.declarations).toContainEqual(
      expect.objectContaining({ kind: "end" }),
    );
  });

  it("parses task relationships embedded in compound task declarations", () => {
    const source = `@startgantt
[Prototype design] lasts 13 days and is colored in Lavender/LightBlue
[Test prototype] lasts 9 days and is colored in Coral/Green and starts 3 days after [Prototype design]'s end
[Write tests] lasts 5 days and ends at [Prototype design]'s end
[Hire tests writers] lasts 6 days and ends at [Write tests]'s start
[Init and write tests report] is colored in Coral/Green
[Init and write tests report] starts 1 day before [Test prototype]'s start and ends at [Test prototype]'s end
@endgantt`;
    const result = parseGantt(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.document.dependencies).toHaveLength(5);
    expect(result.document.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          predecessorTaskId: "prototype design",
          successorTaskId: "write tests",
          relation: "end-after-end",
        }),
        expect.objectContaining({
          predecessorTaskId: "test prototype",
          successorTaskId: "init and write tests report",
          relation: "start-after-start",
          direction: "before",
          offset: expect.objectContaining({ value: 1 }),
        }),
      ]),
    );
    expect(result.document.symbols.tasks.get("write tests")?.declarations).toContainEqual(
      expect.objectContaining({ kind: "end", inline: true }),
    );
  });

  it("accepts named, hexadecimal, and British-spelled task colors", () => {
    const source =
      "@startgantt\n[One] is colored in Orange\n[Two] is colored in #22c55e\n[Three] is coloured in LightBlue\n@endgantt";
    const result = parseGantt(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.document.tasks.map((task) => task.color?.value)).toEqual(["Orange", "#22c55e", "LightBlue"]);
    expect(result.document.tasks.every((task) => task.declarations[0]?.kind === "color")).toBe(true);
  });

  it("retains exact ranges for source-preserving edits", () => {
    const source = "' keep this comment\n[Build] starts 2026-09-05\n";
    const result = parseGantt(`@startgantt\n${source}@endgantt`);
    const start = result.document.symbols.tasks.get("build")?.start;
    expect(start).toBeDefined();
    const changed = applySourceEdits(`@startgantt\n${source}@endgantt`, [{ range: start!.range, text: "2026-09-08" }]);
    expect(changed).toBe("@startgantt\n' keep this comment\n[Build] starts 2026-09-08\n@endgantt");
  });

  it("recovers from malformed and unsupported lines", () => {
    const source =
      "@startgantt\n[Task] lasts abc\nprintscale weekly\nskinparam handwritten true\n[Other] starts\n@endgantt";
    const result = parseGantt(source);
    expect(result.document.tasks).toHaveLength(2);
    expect(result.document.unknown).toHaveLength(1);
    expect(result.diagnostics.map((item) => item.code)).toEqual([
      "invalid-duration",
      "unsupported-syntax",
      "malformed-statement",
    ]);
  });

  it("reports unknown references and invalid values", () => {
    const source = "@startgantt\n[Build] starts at [Missing]'s end\n[Build] is 120% completed\n@endgantt";
    const result = parseGantt(source);
    expect(result.diagnostics.map((item) => item.code)).toEqual(["completion-range", "unknown-task"]);
  });

  it("reports incomplete document boundaries", () => {
    const result = parseGantt("[Task] lasts 2 days");
    expect(result.document.tasks).toHaveLength(1);
    expect(result.diagnostics.map((item) => item.code)).toEqual(["missing-start", "missing-end"]);
  });

  it("resolves a cursor position to the containing task declaration", () => {
    const source = "@startgantt\n[Design] lasts 2 days\n[Build] lasts 3 days\n@endgantt";
    const document = parseGantt(source).document;
    expect(findTaskAt(document, source.indexOf("lasts 3"))?.label).toBe("Build");
    expect(findTaskAt(document, source.indexOf("@endgantt"))).toBeUndefined();
  });

  it("parses an absolute-date milestone", () => {
    const source = "@startgantt\n[DF Rating Production Data Available] happens 2026-09-03\n@endgantt";
    const result = parseGantt(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.document.tasks[0]?.milestone?.value).toBe("2026-09-03");
    expect(result.document.tasks[0]?.milestone).toMatchObject({ resolved: true });
    expect(result.document.tasks[0]?.declarations[0]?.kind).toBe("milestone");
  });

  it("diagnoses an invalid absolute milestone date", () => {
    const result = parseGantt("@startgantt\n[Release] happens someday\n@endgantt");
    expect(result.diagnostics.map((item) => item.code)).toEqual(["invalid-date"]);
    expect(result.diagnostics[0]?.message).toContain("milestone");
  });

  it("accepts common official task forms without false diagnostics", () => {
    const source = `@startgantt
Project starts the 20th of september 2026
[Prototype] requires 10 days
[Long task] requires 1 month
[Mixed task] requires 1 week and 4 days
[Build] on {Alice:50%} requires 2 weeks
[Prototype] pauses on 2026-09-03
[Prototype] links to [[https://plantuml.com]]
[Build] displays on same row as [Prototype]
[Build] starts 3 days after [Prototype]'s end with blue dotted link
[Prototype] -> [Test]
[Old task] is deleted
@endgantt`;
    const result = parseGantt(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.document.symbols.tasks.get("prototype")?.duration?.value).toBe(10);
    expect(result.document.symbols.tasks.get("prototype")?.pauses).toMatchObject([
      { value: "2026-09-03", resolved: true },
    ]);
    expect(result.document.symbols.tasks.get("build")?.sameRowTaskId).toBe("prototype");
    expect(result.document.symbols.tasks.get("long task")?.duration?.unit).toBe("month");
    expect(result.document.symbols.tasks.get("mixed task")?.duration).toMatchObject({
      value: 11,
      unit: "day",
      sourceParts: { weeks: 1, days: 4 },
    });
    expect(
      result.document.dependencies.some(
        (item) => item.predecessorTaskId === "prototype" && item.successorTaskId === "test",
      ),
    ).toBe(true);
    const styledDependency = result.document.dependencies.find(
      (item) => item.predecessorTaskId === "prototype" && item.successorTaskId === "build",
    );
    expect(styledDependency).toMatchObject({
      relation: "start-after-end",
      direction: "after",
      offset: { value: 3 },
      color: { value: "blue" },
      lineStyle: { value: "dotted" },
    });
  });

  it("accepts aliases and D-offset date expressions", () => {
    const result = parseGantt(
      "@startgantt\n[Prototype design] as [TASK1] requires 13 days\n[TASK1] is colored in Lavender\n[TASK2] starts D+15\n@endgantt",
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.document.tasks).toHaveLength(2);
    expect(result.document.tasks[0]).toMatchObject({
      id: "task1",
      label: "Prototype design",
      alias: { value: "TASK1" },
    });
    expect(result.document.tasks[0]?.duration?.value).toBe(13);
    expect(result.document.tasks[0]?.color?.value).toBe("Lavender");
    expect(result.document.symbols.references.get("prototype design")).toBe("task1");
    expect(result.document.tasks[1]?.start).toMatchObject({ value: "D+15", resolved: false });
  });

  it("preserves named and dynamic date expressions without false errors", () => {
    const result = parseGantt(`@startgantt
[Named] starts the 20th of september 2026
[Variable] starts $releaseDate
[Calculated] happens %date("yyyy-MM-dd", $now())
@endgantt`);
    expect(result.diagnostics).toEqual([]);
    expect(result.document.tasks.map((task) => task.start?.value ?? task.milestone?.value)).toEqual([
      "the 20th of september 2026",
      "$releaseDate",
      '%date("yyyy-MM-dd", $now())',
    ]);
  });

  it("parses individual fields and ranges from compound declarations", () => {
    const source =
      "@startgantt\n[Release] starts 2026-09-01 and ends 2026-09-05 and is 50% completed and is coloured in Orange\n@endgantt";
    const result = parseGantt(source);
    const task = result.document.tasks[0]!;
    expect(result.diagnostics).toEqual([]);
    expect(task.start?.value).toBe("2026-09-01");
    expect(task.end?.value).toBe("2026-09-05");
    expect(task.completion?.value).toBe(50);
    expect(task.color?.value).toBe("Orange");
    expect(task.declarations.map((item) => [item.kind, item.inline])).toEqual([
      ["start", true],
      ["end", true],
      ["completion", true],
      ["color", true],
    ]);
  });

  it("parses named resources and percentage allocations", () => {
    const result = parseGantt("@startgantt\n[Build] on {Alice} {Bob:50%} lasts 4 days\n@endgantt");
    expect(result.diagnostics).toEqual([]);
    expect(result.document.tasks[0]?.resources).toMatchObject([{ value: "Alice" }, { value: "Bob", allocation: 50 }]);
  });

  it("parses dividers and attaches notes to tasks and dependency arrows", () => {
    const result = parseGantt(`@startgantt
-- Delivery --
[Design] lasts 2 days
note bottom
Task details
end note
[Build] starts at [Design]'s end
note bottom
Handoff details
end note
[Build] lasts 3 days
@endgantt`);
    expect(result.diagnostics).toEqual([]);
    expect(result.document.dividers).toMatchObject([{ label: "Delivery" }]);
    expect(result.document.symbols.tasks.get("design")?.notes).toMatchObject([
      { text: "Task details", position: "bottom" },
    ]);
    expect(result.document.dependencies[0]?.notes).toMatchObject([{ text: "Handoff details", position: "bottom" }]);
  });

  it("attaches shorthand notes to the preceding task", () => {
    const source = '@startgantt\n[Risk ?] happens 2026-09-01\nnote right: Days needed = "?"\n@endgantt';
    const result = parseGantt(source);
    expect(result.diagnostics).toMatchObject([{ code: "unsupported-gantt-note-position", severity: "error" }]);
    expect(result.document.tasks[0]?.notes).toEqual([
      expect.objectContaining({ position: "right", text: 'Days needed = "?"' }),
    ]);
  });

  it("reports nonstandard block note placement in Gantt diagrams", () => {
    const source = `@startgantt
[DF Download Report Mismatch with Rialto ONE-1777] is colored in Yellow
note right
Duration unknown in source (shown as "?").
end note
@endgantt`;
    const result = parseGantt(source);
    expect(result.diagnostics).toMatchObject([
      {
        code: "unsupported-gantt-note-position",
        severity: "error",
        message: "PlantUML Gantt does not support note right; use note bottom",
      },
    ]);
  });

  it("reports a repeated task prefix with a specific diagnostic", () => {
    const result = parseGantt("@startgantt\n[Build] [Build] starts 2026-09-01\n@endgantt");
    expect(result.diagnostics).toMatchObject([
      { code: "duplicate-task-prefix", message: "Task name is repeated: remove the second [Build]" },
    ]);
  });
});
