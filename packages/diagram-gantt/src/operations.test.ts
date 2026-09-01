import { describe, expect, it } from "vitest";
import {
  createDependency,
  deleteDivider,
  deleteTask,
  insertDivider,
  insertVerticalSeparator,
  insertTask,
  insertMilestone,
  moveDependentTasksByDays,
  moveDivider,
  moveVerticalSeparatorByDays,
  moveTaskByDays,
  removeDependency,
  renameResource,
  renameTask,
  renameTaskAlias,
  reorderTask,
  resizeTaskByDays,
  setNote,
  setTaskDeclaration,
  setTaskLinks,
  setTaskPauses,
  setTaskResources,
  updateDependency,
  updateDivider,
  updateVerticalSeparator,
  deleteVerticalSeparator,
} from "./operations";
import { parseGantt } from "./parser";
import { applySourceEdits } from "./source-edits";

describe("moveTaskByDays", () => {
  it("moves explicit start and end dates without changing surrounding source", () => {
    const source = `@startgantt
' keep this comment
[Build]  starts  2026-09-05
[Build] ends 2026-09-12
@endgantt`;
    const task = parseGantt(source).document.symbols.tasks.get("build");
    expect(task).toBeDefined();
    const operation = moveTaskByDays(task!, 3);
    expect(operation.unavailableReason).toBeUndefined();
    expect(applySourceEdits(source, operation.edits)).toBe(`@startgantt
' keep this comment
[Build]  starts  2026-09-08
[Build] ends 2026-09-15
@endgantt`);
  });

  it("moves across month and year boundaries in UTC", () => {
    const source = "@startgantt\n[Task] starts 2026-12-31\n@endgantt";
    const task = parseGantt(source).document.tasks[0]!;
    const changed = applySourceEdits(source, moveTaskByDays(task, 1).edits);
    expect(changed).toContain("2027-01-01");
  });

  it("refuses relative tasks instead of rewriting their semantics", () => {
    const source = "@startgantt\n[Build] starts at [Design]'s end\n[Build] lasts 5 days\n@endgantt";
    const result = moveTaskByDays(parseGantt(source).document.tasks[0]!, 2);
    expect(result.edits).toEqual([]);
    expect(result.unavailableReason).toContain("no explicit date");
  });
});

describe("moveDependentTasksByDays", () => {
  it("moves every explicitly dated downstream task once", () => {
    const source =
      "@startgantt\n[A] starts 2026-09-01\n[B] starts 2026-09-03\n[B] starts at [A]'s end\n[C] starts 2026-09-05\n[C] starts at [B]'s end\n@endgantt";
    const document = parseGantt(source).document;
    const result = moveDependentTasksByDays(document, "a", 2);
    expect(result.affectedLabels).toEqual(["C", "B"]);
    const changed = applySourceEdits(source, result.edits);
    expect(changed).toContain("[B] starts 2026-09-05");
    expect(changed).toContain("[C] starts 2026-09-07");
  });

  it("detects dependency cycles", () => {
    const source = "@startgantt\n[A] starts at [B]'s end\n[B] starts at [A]'s end\n@endgantt";
    expect(moveDependentTasksByDays(parseGantt(source).document, "a", 1).unavailableReason).toContain("cycle");
  });
});

describe("reorderTask", () => {
  it("moves all declarations together before the target task", () => {
    const source =
      "@startgantt\n[A] starts 2026-09-01\n[A] lasts 2 days\n\n[B] starts 2026-09-03\n[B] lasts 3 days\n@endgantt";
    const document = parseGantt(source).document;
    const changed = applySourceEdits(
      source,
      reorderTask(source, document, document.symbols.tasks.get("b")!, document.symbols.tasks.get("a")!).edits,
    );
    expect(changed.indexOf("[B] starts")).toBeLessThan(changed.indexOf("[A] starts"));
    expect(changed.indexOf("[B] lasts")).toBeLessThan(changed.indexOf("[A] starts"));
  });

  it("reorders downward without joining the task to the end marker", () => {
    const source =
      "@startgantt\r\n[A] starts 2026-09-01\r\n[A] lasts 2 days\r\n[B] starts 2026-09-03\r\n[B] lasts 3 days\r\n[C] starts 2026-09-06\r\n[C] lasts 1 day\r\n@endgantt";
    const document = parseGantt(source).document;
    const changed = applySourceEdits(
      source,
      reorderTask(source, document, document.symbols.tasks.get("a")!, document.symbols.tasks.get("c")!).edits,
    );
    expect(changed.indexOf("[B] starts")).toBeLessThan(changed.indexOf("[A] starts"));
    expect(changed.indexOf("[A] lasts")).toBeLessThan(changed.indexOf("[C] starts"));
    expect(changed).toContain("[C] lasts 1 day\r\n@endgantt");
    expect(parseGantt(changed).diagnostics, changed).toEqual([]);
  });

  it("moves a task to the end for keyboard reordering", () => {
    const source = "@startgantt\n[A] lasts 1 day\n[B] lasts 1 day\n[C] lasts 1 day\n@endgantt";
    const document = parseGantt(source).document;
    const changed = applySourceEdits(
      source,
      reorderTask(source, document, document.symbols.tasks.get("b")!, undefined).edits,
    );
    expect(changed.indexOf("[C]")).toBeLessThan(changed.indexOf("[B]"));
    expect(changed).toContain("[B] lasts 1 day\n@endgantt");
    expect(parseGantt(changed).diagnostics).toEqual([]);
  });

  it("reorders a dependent visually while leaving its relationship after the predecessor", () => {
    const source = "@startgantt\n[A] lasts 2 days\n[B] starts at [A]'s end\n[B] lasts 1 day\n@endgantt";
    const document = parseGantt(source).document;
    const result = reorderTask(source, document, document.symbols.tasks.get("b")!, document.symbols.tasks.get("a")!);
    const changed = applySourceEdits(source, result.edits);
    expect(changed.indexOf("[B] lasts")).toBeLessThan(changed.indexOf("[A] lasts"));
    expect(changed.indexOf("[B] starts at [A]'s end")).toBeGreaterThan(changed.indexOf("[A] lasts"));
    expect(parseGantt(changed).diagnostics).toEqual([]);
  });
});

describe("insertTask", () => {
  it("inserts a dated task immediately before the end marker", () => {
    const source = "@startgantt\n' keep\n\n@endgantt";
    const result = insertTask(source, { label: "Write tests", startDate: "2026-09-02", durationDays: 1 });
    expect(applySourceEdits(source, result.edits)).toBe(
      "@startgantt\n' keep\n\n[Write tests] starts 2026-09-02\n[Write tests] lasts 1 day\n\n@endgantt",
    );
  });

  it("creates a dependency start and preserves CRLF", () => {
    const source = "@startgantt\r\n[Design] lasts 2 days\r\n@endgantt";
    const result = insertTask(source, { label: "Build", predecessorLabel: "Design", durationDays: 5 });
    expect(applySourceEdits(source, result.edits)).toContain(
      "[Build] starts at [Design]'s end\r\n[Build] lasts 5 days\r\n\r\n@endgantt",
    );
  });

  it("rejects unsafe names and invalid durations", () => {
    expect(insertTask("@endgantt", { label: "Bad]", durationDays: 1 }).unavailableReason).toContain("brackets");
    expect(insertTask("@endgantt", { label: "Task", durationDays: 0 }).unavailableReason).toContain("positive");
  });
});

describe("insertMilestone", () => {
  it("inserts a milestone on a set date", () => {
    const source = "@startgantt\n@endgantt";
    const changed = applySourceEdits(source, insertMilestone(source, { label: "Release", date: "2026-09-08" }).edits);
    expect(changed).toContain("[Release] happens 2026-09-08");
    expect(parseGantt(changed).document.tasks[0]?.milestone).toMatchObject({ value: "2026-09-08", resolved: true });
  });

  it("inserts a milestone relative to a task anchor", () => {
    const source = "@startgantt\n[Build] lasts 2 days\n@endgantt";
    const changed = applySourceEdits(
      source,
      insertMilestone(source, { label: "Release", referenceLabel: "Build", referenceAnchor: "end" }).edits,
    );
    expect(changed).toContain("[Release] happens at [Build]'s end");
    expect(parseGantt(changed).diagnostics).toEqual([]);
  });

  it("requires exactly one date mode", () => {
    expect(insertMilestone("@endgantt", { label: "Release" }).unavailableReason).toContain("either");
    expect(insertMilestone("@endgantt", { label: "Release", date: "bad" }).unavailableReason).toContain("YYYY-MM-DD");
  });
});

describe("milestone visual operations", () => {
  it("moves only fixed-date milestones horizontally", () => {
    const fixed = parseGantt("@startgantt\n[Release] happens 2026-09-08\n@endgantt").document.tasks[0]!;
    expect(moveTaskByDays(fixed, 2).edits).toEqual([{ range: fixed.milestone!.range, text: "2026-09-10" }]);
    const relative = parseGantt("@startgantt\n[Build] lasts 2 days\n[Release] happens at [Build]'s end\n@endgantt")
      .document.tasks[1]!;
    expect(moveTaskByDays(relative, 2).unavailableReason).toContain("no explicit date");
  });

  it("reorders milestones as source-preserving diagram rows", () => {
    const source = "@startgantt\n[A] lasts 1 day\n[Release] happens 2026-09-08\n[B] lasts 1 day\n@endgantt";
    const document = parseGantt(source).document;
    const changed = applySourceEdits(
      source,
      reorderTask(source, document, document.tasks[1]!, document.tasks[0]!).edits,
    );
    expect(changed.indexOf("[Release]")).toBeLessThan(changed.indexOf("[A]"));
    expect(parseGantt(changed).diagnostics).toEqual([]);
  });
});

describe("task inspector operations", () => {
  it("replaces all task pause dates as source-preserving declarations", () => {
    const source = "@startgantt\n[A] starts 2026-09-01\n[A] lasts 3 days\n[A] pauses on 2026-09-02\n@endgantt";
    const task = parseGantt(source).document.tasks[0]!;
    const changed = applySourceEdits(source, setTaskPauses(source, task, ["2026-09-03", "2026-09-04"]).edits);
    expect(changed).not.toContain("pauses on 2026-09-02");
    expect(changed).toContain("[A] pauses on 2026-09-03\n[A] pauses on 2026-09-04");
    expect(parseGantt(changed).diagnostics).toEqual([]);
  });

  it("supports PlantUML weekday pauses", () => {
    const source = "@startgantt\n[A] lasts 5 days\n@endgantt";
    const task = parseGantt(source).document.tasks[0]!;
    const changed = applySourceEdits(source, setTaskPauses(source, task, ["monday", "2026-09-03"]).edits);
    expect(changed).toContain("[A] pauses on monday");
    expect(parseGantt(changed).diagnostics).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "invalid-date" })]),
    );
  });

  it("writes a selected color when inserting a task", () => {
    const source = "@startgantt\n@endgantt";
    const changed = applySourceEdits(
      source,
      insertTask(source, { label: "Build", durationDays: 2, startDate: "2026-09-01", color: "Orange" }).edits,
    );
    expect(changed).toContain("[Build] is colored in Orange");
  });

  it("replaces task links without rewriting unrelated source", () => {
    const source = "@startgantt\n' keep\n[A] lasts 2 days\n[A] links to [[https://old.example Old]]\n@endgantt";
    const task = parseGantt(source).document.tasks[0]!;
    const changed = applySourceEdits(
      source,
      setTaskLinks(source, task, [{ url: "https://new.example", label: "Details" }, { url: "https://docs.example" }])
        .edits,
    );
    expect(changed).toContain("' keep");
    expect(changed).not.toContain("old.example");
    expect(changed).toContain("[A] links to [[https://new.example Details]]");
    expect(parseGantt(changed).document.tasks[0]!.links).toHaveLength(2);
  });
  it("renames a person across every resource assignment", () => {
    const source = "@startgantt\n[A] on {Alice:50%} starts 2026-09-01\n[B] on {Alice} lasts 2 days\n@endgantt";
    const document = parseGantt(source).document;
    const changed = applySourceEdits(source, renameResource(document, "Alice", "Alicia").edits);
    expect(changed).toContain("{Alicia:50%}");
    expect(changed).toContain("{Alicia}");
  });
  it("adds and replaces task resources without rewriting the task statement", () => {
    const source = "@startgantt\n  [Build] on {Alice} starts 2026-09-01\n[Build] lasts 2 days\n@endgantt";
    const task = parseGantt(source).document.tasks[0]!;
    const changed = applySourceEdits(
      source,
      setTaskResources(source, task, [{ name: "Bob", allocation: 50 }, { name: "Cara" }]).edits,
    );
    expect(changed).toContain("  [Build] on {Bob:50%} {Cara} starts 2026-09-01");
    expect(changed).toContain("[Build] lasts 2 days");
  });
  it("renames declarations and dependency references without touching comments", () => {
    const source =
      "@startgantt\n' [Build] in a comment\n[Build] lasts 2 days\n[Test] starts at [Build]'s end\n[Test] lasts 1 day\n@endgantt";
    const document = parseGantt(source).document;
    const changed = applySourceEdits(
      source,
      renameTask(source, document, document.symbols.tasks.get("build")!, "Compile").edits,
    );
    expect(changed).toContain("' [Build] in a comment");
    expect(changed).toContain("[Compile] lasts 2 days");
    expect(changed).toContain("[Test] starts at [Compile]'s end");
  });

  it("replaces, adds, and removes individual declarations", () => {
    const source = "@startgantt\n  [Build] lasts 2 days\n@endgantt";
    const task = parseGantt(source).document.tasks[0]!;
    expect(applySourceEdits(source, setTaskDeclaration(source, task, "duration", "lasts 5 weeks").edits)).toContain(
      "  [Build] lasts 5 weeks",
    );
    const withColor = applySourceEdits(source, setTaskDeclaration(source, task, "color", "is colored in Orange").edits);
    expect(withColor).toContain("[Build] lasts 2 days\n[Build] is colored in Orange");
    expect(applySourceEdits(source, setTaskDeclaration(source, task, "duration").edits)).not.toContain("lasts");
  });

  it("adds declarations to aliased tasks through the stable alias", () => {
    const source = "@startgantt\n[Prototype] as [P1] lasts 2 days\n@endgantt";
    const task = parseGantt(source).document.tasks[0]!;
    const changed = applySourceEdits(source, setTaskDeclaration(source, task, "start", "starts 2026-09-01").edits);
    expect(changed).toContain("[P1] starts 2026-09-01");
    expect(changed).not.toContain("[Prototype] starts 2026-09-01");
    expect(parseGantt(changed).document.tasks).toHaveLength(1);
  });

  it("deletes task declarations and relationships that point to it", () => {
    const source = "@startgantt\n[Build] lasts 2 days\n[Test] starts at [Build]'s end\n[Test] lasts 1 day\n@endgantt";
    const document = parseGantt(source).document;
    const changed = applySourceEdits(source, deleteTask(source, document, document.tasks[0]!).edits);
    expect(changed).not.toContain("[Build]");
    expect(changed).toContain("[Test] lasts 1 day");
  });

  it("updates one clause of a compound declaration without rewriting the others", () => {
    const source = "@startgantt\n[Build] starts 2026-09-01 and requires 2 days and is colored in Blue\n@endgantt";
    const task = parseGantt(source).document.tasks[0]!;
    const changed = applySourceEdits(source, setTaskDeclaration(source, task, "duration", "lasts 5 days").edits);
    expect(changed).toBe("@startgantt\n[Build] starts 2026-09-01 and lasts 5 days and is colored in Blue\n@endgantt");
  });

  it("renames an aliased task without changing its alias references", () => {
    const source =
      "@startgantt\n[Prototype] as [P1] requires 2 days\n[P1] is colored in Blue\n[Test] starts at [P1]'s end\n@endgantt";
    const document = parseGantt(source).document;
    const changed = applySourceEdits(
      source,
      renameTask(source, document, document.symbols.tasks.get("p1")!, "Design").edits,
    );
    expect(changed).toContain("[Design] as [P1]");
    expect(changed).toContain("[P1] is colored in Blue");
    expect(changed).toContain("[Test] starts at [P1]'s end");
  });

  it("renames visible-label references to an aliased task without creating a second task", () => {
    const source =
      "@startgantt\n[Prototype] as [P1] requires 2 days\n[P1] is colored in Blue\n[Prototype] starts 2026-09-01\n@endgantt";
    const document = parseGantt(source).document;
    const changed = applySourceEdits(
      source,
      renameTask(source, document, document.symbols.tasks.get("p1")!, "Design").edits,
    );
    const reparsed = parseGantt(changed);
    expect(changed).toContain("[Design] as [P1]");
    expect(changed).toContain("[P1] is colored in Blue");
    expect(changed).toContain("[Design] starts 2026-09-01");
    expect(reparsed.document.tasks).toHaveLength(1);
  });

  it("renames an alias and every semantic alias reference", () => {
    const source =
      "@startgantt\n[Prototype] as [P1] requires 2 days\n[P1] is colored in Blue\n[Test] starts at [P1]'s end\n@endgantt";
    const document = parseGantt(source).document;
    const changed = applySourceEdits(
      source,
      renameTaskAlias(source, document, document.symbols.tasks.get("p1")!, "DesignId").edits,
    );
    expect(changed).toContain("[Prototype] as [DesignId]");
    expect(changed).toContain("[DesignId] is colored in Blue");
    expect(changed).toContain("[Test] starts at [DesignId]'s end");
  });

  it("renames every repeated person assignment without touching comments", () => {
    const source =
      "@startgantt\n' {Alice} in a comment\n[A] on {Alice:50%} lasts 2 days\n[B] on {Alice} lasts 1 day\n@endgantt";
    const document = parseGantt(source).document;
    const changed = applySourceEdits(source, renameResource(document, "Alice", "Alicia", source).edits);
    expect(changed).toContain("' {Alice} in a comment");
    expect(changed).toContain("{Alicia:50%}");
    expect(changed).toContain("{Alicia}");
  });
});

describe("dependency operations", () => {
  it.each([
    ["end", "start", "[B] starts at [A]'s end", "start-after-end"],
    ["start", "start", "[B] starts at [A]'s start", "start-after-start"],
    ["end", "end", "[B] ends at [A]'s end", "end-after-end"],
    ["start", "end", "[B] ends at [A]'s start", "end-after-start"],
  ] as const)("creates a %s-to-%s dependency", (predecessorAnchor, successorAnchor, syntax, relation) => {
    const source = "@startgantt\n[A] lasts 2 days\n[B] lasts 3 days\n@endgantt";
    const document = parseGantt(source).document;
    const changed = applySourceEdits(
      source,
      createDependency(
        source,
        document.symbols.tasks.get("a")!,
        document.symbols.tasks.get("b")!,
        predecessorAnchor,
        successorAnchor,
      ).edits,
    );
    expect(changed).toContain(syntax);
    expect(parseGantt(changed).document.dependencies[0]?.relation).toBe(relation);
  });

  it("moves a new constraint after all task declarations", () => {
    const source =
      "@startgantt\n' keep\n[Design] lasts 2 days\n  [Build] starts 2026-09-05\n[Build] lasts 4 days\n@endgantt";
    const document = parseGantt(source).document;
    const result = createDependency(
      source,
      document.symbols.tasks.get("design")!,
      document.symbols.tasks.get("build")!,
    );
    expect(applySourceEdits(source, result.edits)).toBe(
      "@startgantt\n' keep\n[Design] lasts 2 days\n\n[Build] lasts 4 days\n[Build] starts at [Design]'s end\n@endgantt",
    );
  });

  it("creates a dependency on a task declared later without a forward reference", () => {
    const source =
      "@startgantt\n[Frontend] starts 2026-09-05\n[Frontend] lasts 10 days\n[Testing] starts 2026-09-13\n[Testing] lasts 5 days\n@endgantt";
    const document = parseGantt(source).document;
    const changed = applySourceEdits(
      source,
      createDependency(source, document.symbols.tasks.get("testing")!, document.symbols.tasks.get("frontend")!).edits,
    );

    expect(changed.indexOf("[Frontend] starts at [Testing]'s end")).toBeGreaterThan(
      changed.indexOf("[Testing] lasts 5 days"),
    );
    expect(parseGantt(changed).diagnostics).toEqual([]);
    expect(parseGantt(changed).document.dependencies).toMatchObject([
      { predecessorTaskId: "testing", successorTaskId: "frontend", relation: "start-after-end" },
    ]);
  });

  it("preserves a resource assignment when an explicit start becomes a dependency", () => {
    const source =
      "@startgantt\n[Backend] starts 2026-09-01\n[Backend] lasts 4 days\n[Frontend] on {Kalle:100%} starts 2026-09-01\n[Frontend] lasts 4 days\n@endgantt";
    const document = parseGantt(source).document;
    const changed = applySourceEdits(
      source,
      createDependency(source, document.symbols.tasks.get("backend")!, document.symbols.tasks.get("frontend")!).edits,
    );

    expect(changed).toContain("[Frontend] on {Kalle:100%} starts at [Backend]'s end");
    expect(parseGantt(changed).document.symbols.tasks.get("frontend")?.resources).toEqual([
      expect.objectContaining({ value: "Kalle", allocation: 100 }),
    ]);
  });

  it("splits a compound start declaration without duplicating the task prefix", () => {
    const source =
      "@startgantt\n[Design] lasts 2 days\n[Build] starts 2026-09-05 and ends 2026-09-10 and is colored in Blue\n@endgantt";
    const document = parseGantt(source).document;
    const result = createDependency(
      source,
      document.symbols.tasks.get("design")!,
      document.symbols.tasks.get("build")!,
    );
    const changed = applySourceEdits(source, result.edits);
    expect(changed).toContain("[Build] lasts 6 days and is colored in Blue\n[Build] starts at [Design]'s end");
    expect(changed).not.toContain("[Build] [Build]");
    expect(parseGantt(changed).diagnostics).toEqual([]);
    expect(parseGantt(changed).document.dependencies).toHaveLength(1);
  });

  it("keeps a compound declaration's resource assignment without duplicating it", () => {
    const source =
      "@startgantt\n[Design] lasts 2 days\n[Build] on {Kalle:100%} starts 2026-09-05 and ends 2026-09-10\n@endgantt";
    const document = parseGantt(source).document;
    const changed = applySourceEdits(
      source,
      createDependency(source, document.symbols.tasks.get("design")!, document.symbols.tasks.get("build")!).edits,
    );

    expect(changed.match(/\{Kalle:100%}/g)).toHaveLength(1);
    expect(parseGantt(changed).document.symbols.tasks.get("build")?.resources).toEqual([
      expect.objectContaining({ value: "Kalle", allocation: 100 }),
    ]);
  });

  it("preserves an explicit date range as a working-day duration", () => {
    const source =
      "@startgantt\nsaturday are closed\nsunday are closed\n[Design] lasts 2 days\n[Build] starts 2026-09-04\n[Build] ends 2026-09-08\n@endgantt";
    const document = parseGantt(source).document;
    const changed = applySourceEdits(
      source,
      createDependency(source, document.symbols.tasks.get("design")!, document.symbols.tasks.get("build")!).edits,
    );
    expect(changed).toContain("[Build] starts at [Design]'s end");
    expect(changed).toContain("[Build] lasts 3 days");
    expect(changed).not.toContain("[Build] ends 2026-09-08");
  });

  it("preserves duration with closed and exceptionally opened calendar dates", () => {
    const source =
      "@startgantt\nsaturday are closed\nsunday are closed\n2026-09-05 is opened\n2026-09-07 is closed\n[Design] lasts 2 days\n[Build] starts 2026-09-04\n[Build] ends 2026-09-08\n@endgantt";
    const document = parseGantt(source).document;
    const changed = applySourceEdits(
      source,
      createDependency(source, document.symbols.tasks.get("design")!, document.symbols.tasks.get("build")!).edits,
    );
    expect(changed).toContain("[Build] lasts 3 days");
    expect(changed).toContain("2026-09-05 is opened");
    expect(changed).toContain("2026-09-07 is closed");
  });

  it("uses aliases and preserves CRLF when creating a dependency", () => {
    const source =
      "@startgantt\r\n[Long design name] as [D1] lasts 2 days\r\n[Long build name] as [B1] starts 2026-09-05 and ends 2026-09-08 and is colored in Blue\r\n@endgantt";
    const document = parseGantt(source).document;
    const changed = applySourceEdits(
      source,
      createDependency(source, document.symbols.tasks.get("d1")!, document.symbols.tasks.get("b1")!).edits,
    );
    expect(changed).toContain("[B1] starts at [D1]'s end\r\n");
    expect(changed).not.toContain("[Long build name] [Long build name]");
    expect(changed).not.toMatch(/(^|[^\r])\n/);
    expect(parseGantt(changed).diagnostics).toEqual([]);
  });

  it("inserts after a successor with no start declaration", () => {
    const source = "@startgantt\n[Design] lasts 2 days\n[Build] lasts 4 days\n@endgantt";
    const document = parseGantt(source).document;
    const changed = applySourceEdits(source, createDependency(source, document.tasks[0]!, document.tasks[1]!).edits);
    expect(changed).toContain("[Build] lasts 4 days\n[Build] starts at [Design]'s end");
  });

  it("removes only the dependency line", () => {
    const source =
      "@startgantt\n[Design] lasts 2 days\n[Build] starts at [Design]'s end\n[Build] lasts 4 days\n@endgantt";
    const dependency = parseGantt(source).document.dependencies[0]!;
    const changed = applySourceEdits(source, removeDependency(source, dependency.sourceRange).edits);
    expect(changed).toBe("@startgantt\n[Design] lasts 2 days\n[Build] lasts 4 days\n@endgantt");
  });

  it("rewrites dependency type, offset, direction, color, and style", () => {
    const source =
      "@startgantt\n[Design] lasts 2 days\n[Build] starts at [Design]'s end\n[Build] lasts 4 days\n@endgantt";
    const dependency = parseGantt(source).document.dependencies[0]!;
    const changed = applySourceEdits(
      source,
      updateDependency(source, dependency, {
        predecessorLabel: "Design",
        successorLabel: "Build",
        relation: "start-after-start",
        offset: 3,
        direction: "after",
        color: "Blue",
        lineStyle: "dotted",
      }).edits,
    );
    expect(changed).toContain("[Build] starts 3 days after [Design]'s start with Blue dotted link");
  });

  it("preserves a resource assignment on the same line when rewriting the dependency", () => {
    const source =
      "@startgantt\n[Design] lasts 2 days\n[Build] on {Kalle:50%} starts at [Design]'s end\n[Build] lasts 4 days\n@endgantt";
    const dependency = parseGantt(source).document.dependencies[0]!;
    const changed = applySourceEdits(
      source,
      updateDependency(source, dependency, {
        predecessorLabel: "Design",
        successorLabel: "Build",
        relation: "start-after-start",
        offset: 3,
        direction: "after",
        lineStyle: "solid",
      }).edits,
    );
    expect(changed).toContain("[Build] on {Kalle:50%} starts 3 days after [Design]'s start");
  });
});

describe("annotations", () => {
  it("inserts dividers and adds, updates, and removes notes", () => {
    const source = "@startgantt\n[Build] lasts 2 days\n@endgantt";
    const task = parseGantt(source).document.tasks[0]!;
    const divided = applySourceEdits(source, insertDivider(source, "Delivery", task.declarations[0]!.range).edits);
    expect(divided).toContain("-- Delivery --\n[Build]");
    const noted = applySourceEdits(
      source,
      setNote(source, task.sourceRange, task.notes, "First line\nSecond line", "bottom").edits,
    );
    expect(noted).toContain("note bottom\nFirst line\nSecond line\nend note");
    const reparsed = parseGantt(noted).document.tasks[0]!;
    const changed = applySourceEdits(
      noted,
      setNote(noted, reparsed.sourceRange, reparsed.notes, "Revised", "right").edits,
    );
    expect(changed).toContain("note bottom\nRevised\nend note");
    const changedTask = parseGantt(changed).document.tasks[0]!;
    expect(
      applySourceEdits(changed, setNote(changed, changedTask.sourceRange, changedTask.notes, "").edits),
    ).not.toContain("note bottom");
  });

  it("moves a divider before a task or to the end", () => {
    const source = "@startgantt\n-- Phase --\n[A] lasts 1 day\n[B] lasts 1 day\n@endgantt";
    const document = parseGantt(source).document;
    const beforeB = document.symbols.tasks.get("b")!.declarations[0]!.range;
    const moved = applySourceEdits(source, moveDivider(source, document.dividers[0]!.sourceRange, beforeB).edits);
    expect(moved).toBe("@startgantt\n[A] lasts 1 day\n-- Phase --\n[B] lasts 1 day\n@endgantt");
    const movedDocument = parseGantt(moved).document;
    const atEnd = applySourceEdits(moved, moveDivider(moved, movedDocument.dividers[0]!.sourceRange).edits);
    expect(atEnd).toBe("@startgantt\n[A] lasts 1 day\n[B] lasts 1 day\n-- Phase --\n@endgantt");
  });

  it("renames and deletes a divider without touching surrounding source", () => {
    const source = "@startgantt\n' keep\n-- Phase one --\n[A] lasts 2 days\n@endgantt";
    const divider = parseGantt(source).document.dividers[0]!;
    const renamed = applySourceEdits(source, updateDivider(source, divider.sourceRange, "Delivery").edits);
    expect(renamed).toContain("' keep\n-- Delivery --\n[A]");
    const renamedDivider = parseGantt(renamed).document.dividers[0]!;
    const deleted = applySourceEdits(renamed, deleteDivider(renamed, renamedDivider.sourceRange).edits);
    expect(deleted).toBe("@startgantt\n' keep\n[A] lasts 2 days\n@endgantt");
  });

  it("inserts a PlantUML vertical separator relative to a task boundary", () => {
    const source = "@startgantt\n[A] lasts 2 days\n@endgantt";
    const changed = applySourceEdits(
      source,
      insertVerticalSeparator(source, {
        taskLabel: "A",
        anchor: "end",
        offset: 2,
        direction: "after",
      }).edits,
    );
    expect(changed).toContain("Separator just 2 days after [A]'s end");
    expect(parseGantt(changed).document.verticalSeparators).toEqual([
      expect.objectContaining({ taskLabel: "A", anchor: "end", offset: 2, direction: "after" }),
    ]);
  });

  it("moves a vertical separator across its reference boundary", () => {
    const source = "@startgantt\n[A] lasts 2 days\nSeparator just 2 days before [A]'s end\n@endgantt";
    const separator = parseGantt(source).document.verticalSeparators[0]!;
    const changed = applySourceEdits(source, moveVerticalSeparatorByDays(source, separator, 5).edits);
    expect(changed).toContain("Separator just 3 days after [A]'s end");
  });

  it("edits and deletes a vertical separator without rewriting tasks", () => {
    const source = "@startgantt\n[A] lasts 2 days\n[B] lasts 3 days\nSeparator just at [A]'s end\n@endgantt";
    const separator = parseGantt(source).document.verticalSeparators[0]!;
    const changed = applySourceEdits(
      source,
      updateVerticalSeparator(separator, { taskLabel: "B", anchor: "start", offset: 1, direction: "before" }).edits,
    );
    expect(changed).toContain("[A] lasts 2 days\n[B] lasts 3 days");
    expect(changed).toContain("Separator just 1 day before [B]'s start");
    const current = parseGantt(changed).document.verticalSeparators[0]!;
    expect(applySourceEdits(changed, deleteVerticalSeparator(changed, current).edits)).not.toContain("Separator just");
  });

  it("keeps comments, dividers, and notes intact while reordering a task", () => {
    const source =
      "@startgantt\n-- Phase --\n' explanation for A\n[A] starts 2026-09-01 and lasts 2 days\nnote bottom\nKeep this note\nend note\n' separator comment\n[B] starts 2026-09-04 and lasts 2 days\n@endgantt";
    const document = parseGantt(source).document;
    const changed = applySourceEdits(
      source,
      reorderTask(source, document, document.symbols.tasks.get("a")!, document.symbols.tasks.get("b")!).edits,
    );
    expect(changed).toContain("-- Phase --");
    expect(changed).toContain("' explanation for A");
    expect(changed).toContain("note bottom\nKeep this note\nend note");
    expect(changed).toContain("' separator comment");
    expect(parseGantt(changed).diagnostics, changed).toEqual([]);
  });
});

describe("resizeTaskByDays", () => {
  it("changes only a day-based duration value", () => {
    const source = "@startgantt\n' comment\n[Build]  lasts  5 days\n@endgantt";
    const task = parseGantt(source).document.tasks[0]!;
    expect(applySourceEdits(source, resizeTaskByDays(task, 3).edits)).toBe(
      "@startgantt\n' comment\n[Build]  lasts  8 days\n@endgantt",
    );
  });

  it("preserves week-based expression style", () => {
    const source = "@startgantt\n[Build] lasts 2 weeks\n@endgantt";
    const task = parseGantt(source).document.tasks[0]!;
    expect(applySourceEdits(source, resizeTaskByDays(task, 7).edits)).toContain("lasts 3 weeks");
    expect(resizeTaskByDays(task, 1).unavailableReason).toContain("whole weeks");
  });

  it("prevents zero or negative durations", () => {
    const task = parseGantt("@startgantt\n[Build] lasts 2 days\n@endgantt").document.tasks[0]!;
    expect(resizeTaskByDays(task, -2).unavailableReason).toContain("at least one day");
  });
});
