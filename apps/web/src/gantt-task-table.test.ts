import { expect, it } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { editTaskRow, taskRowValue, type TaskRowDraft } from "./gantt-task-table";
const source = `@startgantt
!theme cerulean
' Preserve this comment
Project starts 2026-10-01
[Design] lasts 2 days
[Build] as [build] on {Morgan:50%} starts at [Design]'s end and lasts 3 days
[Build] is 20% completed
[Build] links to [[https://example.com Details]]
note bottom
  Preserve  this text
end note
@endgantt`;
function draft(value = source): TaskRowDraft {
  const task = parseGantt(value).document.symbols.tasks.get("build")!;
  return { taskId: task.id, source: value, value: taskRowValue(task) };
}
it("updates three fields atomically while retaining aliases, scheduling, links and notes", () => {
  const edit = draft();
  edit.value = {
    label: "Delivery",
    duration: "3",
    durationUnit: "day",
    completion: "75",
    resources: [
      { name: "Casey", allocation: "25" },
      { name: "Platform Team", allocation: "" },
    ],
  };
  const result = editTaskRow(source, edit);
  if ("error" in result) throw new Error(result.error);
  expect(result.taskId).toBe("build");
  expect(result.task.label).toBe("Delivery");
  expect(result.task.completion?.value).toBe(75);
  expect(result.task.resources?.map((r) => [r.value, r.allocation])).toEqual([
    ["Casey", 25],
    ["Platform Team", undefined],
  ]);
  expect(result.source).toContain("starts at [Design]'s end and lasts 3 days");
  for (const text of [
    "!theme cerulean",
    "' Preserve this comment",
    "links to [[https://example.com Details]]",
    "  Preserve  this text",
  ])
    expect(result.source).toContain(text);
  expect(source).toContain("[Build] is 20% completed");
});
it("leaves unchanged fields byte-for-byte intact and removes explicit progress/resources only on request", () => {
  expect(editTaskRow(source, draft())).toMatchObject({ source });
  const edit = draft();
  edit.value.completion = "";
  edit.value.resources = [];
  const result = editTaskRow(source, edit);
  if ("error" in result) throw new Error(result.error);
  expect(result.source).not.toContain("completed");
  expect(result.task.resources ?? []).toEqual([]);
  expect(result.source).toContain("starts at [Design]'s end and lasts 3 days");
});
it("renames unaliased task references and keeps separate dependencies", () => {
  const value =
    "@startgantt\nProject starts 2026-10-01\n[Build] lasts 2 days\n[Ship] lasts 1 day\n[Ship] starts at [Build]'s end\n@endgantt";
  const edit = draft(value);
  edit.value.label = "Compile";
  const result = editTaskRow(value, edit);
  if ("error" in result) throw new Error(result.error);
  expect(result.taskId).toBe("compile");
  expect(result.source).toContain("[Ship] starts at [Compile]'s end");
});
it.each(["-1", "101", "1.5", "hello"])("rejects invalid progress %s without a partial edit", (completion) => {
  const edit = draft();
  edit.value.label = "Renamed";
  edit.value.completion = completion;
  expect(editTaskRow(source, edit)).toMatchObject({ error: expect.stringContaining("Progress") });
});
it("rejects stale drafts, name collisions, injection and invalid resource allocations", () => {
  expect(editTaskRow(source + "\n", draft())).toMatchObject({ error: expect.stringContaining("changed") });
  for (const label of ["Design", "", "bad[name]", "new\n[Injected] lasts 2 days"]) {
    const edit = draft();
    edit.value.label = label;
    expect(editTaskRow(source, edit)).toHaveProperty("error");
  }
  for (const [name, allocation] of [
    ["Casey", "101"],
    ["Casey", "0"],
    ["Casey", "1.5"],
    ["Bad\nTask", "50"],
    ["Bad:Name", "50"],
    ["", "50"],
  ]) {
    const edit = draft();
    edit.value.resources = [{ name: name!, allocation: allocation! }];
    expect(editTaskRow(source, edit)).toHaveProperty("error");
  }
});
it("retains unknown statements when editing unrelated fields", () => {
  const value = source.replace("@endgantt", "' custom section\ncustom preserved statement\n@endgantt");
  const edit = draft(value);
  edit.value.completion = "0";
  const result = editTaskRow(value, edit);
  if ("error" in result) throw new Error(result.error);
  expect(result.source).toContain("custom preserved statement");
  expect(result.task.completion?.value).toBe(0);
});
it("withholds ambiguous progress edits", () => {
  const value = source.replace("[Build] is 20% completed", "[Build] is 20% completed\n[Build] is 30% completed");
  const edit = draft(value);
  edit.value.completion = "40";
  expect(editTaskRow(value, edit)).toMatchObject({ error: expect.stringContaining("multiple progress") });
});

it("stages multiple rows atomically and preserves references through two renames", async () => {
  const { editTaskRows } = await import("./gantt-task-table");
  const value = "@startgantt\n[Build] lasts 2 days\n[Ship] lasts 1 day\n[Ship] starts at [Build]'s end\n@endgantt";
  const drafts = parseGantt(value).document.tasks.map((task) => ({
    taskId: task.id,
    source: value,
    value: taskRowValue(task),
  }));
  drafts[0]!.value.label = "Compile";
  drafts[0]!.value.completion = "40";
  drafts[1]!.value.label = "Release";
  drafts[1]!.value.completion = "101";
  expect(editTaskRows(value, drafts)).toMatchObject({ taskId: "ship", error: expect.stringContaining("Progress") });
  expect(value).toContain("[Build] lasts");
  drafts[1]!.value.completion = "50";
  const result = editTaskRows(value, drafts);
  if ("error" in result) throw new Error(result.error);
  expect(result.source).toContain("[Release] starts at [Compile]'s end");
  expect(result.edits.map((edit) => edit.original.label)).toEqual(["Build", "Ship"]);
  expect(result.edits.map((edit) => edit.task.label)).toEqual(["Compile", "Release"]);
  expect(editTaskRows(value + "\n", drafts)).toMatchObject({ error: expect.stringContaining("changed") });
});

it("updates inline duration and units without rewriting start dependencies", () => {
  const edit = draft();
  edit.value.duration = "2";
  edit.value.durationUnit = "week";
  const result = editTaskRow(source, edit);
  if ("error" in result) throw new Error(result.error);
  expect(result.source).toContain("starts at [Design]'s end and lasts 2 weeks");
  expect(result.task.duration).toMatchObject({ value: 2, unit: "week" });
});
it.each(["", "0", "-2", "1.5", "oops"])("rejects unsafe duration %s", (duration) => {
  const edit = draft();
  edit.value.duration = duration;
  expect(editTaskRow(source, edit)).toMatchObject({ error: expect.stringContaining("Duration") });
});
it("preserves end-based schedules instead of silently adding a competing duration", () => {
  const value = "@startgantt\n[Build] starts 2026-10-01\n[Build] ends 2026-10-05\n@endgantt";
  const edit = draft(value);
  edit.value.duration = "3";
  expect(editTaskRow(value, edit)).toMatchObject({ error: expect.stringContaining("end constraint") });
  edit.value.duration = "";
  edit.value.completion = "25";
  expect(editTaskRow(value, edit)).toMatchObject({ source: expect.stringContaining("ends 2026-10-05") });
});

it("blocks duration changes against a relative end constraint and preserves monthly units", () => {
  const value = "@startgantt\n[Design] lasts 3 days\n[Build] lasts 1 day\n[Build] ends at [Design]'s end\n@endgantt";
  const edit = draft(value);
  edit.value.duration = "4";
  expect(editTaskRow(value, edit)).toMatchObject({ error: expect.stringContaining("end constraint") });
  const monthly = "@startgantt\n[Build] lasts 2 months\n@endgantt";
  const unchanged = draft(monthly);
  unchanged.value.completion = "25";
  expect(editTaskRow(monthly, unchanged)).toMatchObject({ source: expect.stringContaining("lasts 2 months") });
});
