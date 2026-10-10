// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { GanttTaskTable } from "./GanttTaskTable";
import { type TaskRowDraft, taskRowValue } from "./gantt-task-table";
afterEach(cleanup);
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
const source = "@startgantt\n[Build] lasts 3 days\n[Ship] lasts 1 day\n@endgantt";
const tasks = parseGantt(source).document.tasks;
it("stages a row, validates values, applies explicitly and cancels without committing", () => {
  const apply = vi.fn(() => undefined);
  function Host() {
    const [draft, setDraft] = useState<TaskRowDraft[]>([]);
    return (
      <GanttTaskTable
        tasks={tasks}
        source={source}
        selectedTaskId={undefined}
        readOnly={false}
        drafts={draft}
        onDraftChange={setDraft}
        onSelect={() => true}
        onDetails={vi.fn()}
        onApply={apply}
      />
    );
  }
  render(<Host />);
  fireEvent.change(screen.getAllByRole("textbox", { name: "Progress (%)" })[0]!, { target: { value: "150" } });
  expect((screen.getByRole("button", { name: "Apply changes" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getAllByRole("alert")[0]!.textContent).toContain("Progress");
  fireEvent.change(screen.getAllByRole("textbox", { name: "Progress (%)" })[0]!, { target: { value: "50" } });
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));
  expect(apply).toHaveBeenCalledOnce();
  fireEvent.change(screen.getAllByRole("textbox", { name: "Duration" })[1]!, { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
  expect(apply).toHaveBeenCalledOnce();
});
it("disables read-only editing and explains stale draft recovery", () => {
  const draft = { taskId: "build", source, value: taskRowValue(tasks[0]!) };
  const props = {
    tasks,
    selectedTaskId: "build",
    onDraftChange: vi.fn(),
    onSelect: () => true,
    onDetails: vi.fn(),
    onApply: vi.fn(() => undefined),
  };
  const view = render(<GanttTaskTable {...props} source={source} readOnly drafts={[]} />);
  expect((screen.getAllByRole("textbox", { name: "Task name" })[0]! as HTMLButtonElement).disabled).toBe(true);
  view.rerender(<GanttTaskTable {...props} source={source + "\n"} readOnly={false} drafts={[draft]} />);
  expect(screen.getAllByRole("alert")[0]!.textContent).toContain("source changed");
  fireEvent.click(screen.getByRole("button", { name: "Reload staged rows from source" }));
  expect(props.onDraftChange).toHaveBeenCalledWith([expect.objectContaining({ source: source + "\n" })]);
});
it("bounds initial row rendering and reveals a chart-selected row beyond the first page", () => {
  const large = Array.from({ length: 250 }, (_, i) => ({ ...tasks[0]!, id: `task-${i}`, label: `Task ${i}` }));
  const props = {
    tasks: large,
    source,
    readOnly: false,
    drafts: [],
    onDraftChange: vi.fn(),
    onSelect: () => true,
    onDetails: vi.fn(),
    onApply: vi.fn(() => undefined),
  };
  const view = render(<GanttTaskTable {...props} selectedTaskId={undefined} />);
  expect(screen.getAllByRole("row")).toHaveLength(101);
  view.rerender(<GanttTaskTable {...props} selectedTaskId="task-249" />);
  expect(screen.getAllByRole("textbox", { name: "Task name" })).toHaveLength(250);
});

it("keeps multiple row drafts, marks errors and applies the full batch once", () => {
  const apply = vi.fn(() => undefined);
  function Host() {
    const [drafts, setDrafts] = useState<TaskRowDraft[]>([]);
    return (
      <GanttTaskTable
        tasks={tasks}
        source={source}
        selectedTaskId={undefined}
        readOnly={false}
        drafts={drafts}
        onDraftChange={setDrafts}
        onSelect={() => true}
        onDetails={vi.fn()}
        onApply={apply}
      />
    );
  }
  render(<Host />);
  fireEvent.change(screen.getAllByRole("textbox", { name: "Progress (%)" })[0]!, { target: { value: "40" } });
  const progress = screen.getAllByRole("textbox", { name: "Progress (%)" });
  expect((progress[0] as HTMLInputElement).value).toBe("40");
  fireEvent.change(progress[1]!, { target: { value: "150" } });
  expect((screen.getByRole("button", { name: "Apply changes" }) as HTMLButtonElement).disabled).toBe(true);
  expect(progress[1]!.getAttribute("aria-invalid")).toBe("true");
  expect(apply).not.toHaveBeenCalled();
  fireEvent.change(progress[1]!, { target: { value: "50" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));
  expect(apply).toHaveBeenCalledOnce();
  expect(apply.mock.calls[0]).toEqual([
    [
      expect.objectContaining({ taskId: "build", value: expect.objectContaining({ completion: "40" }) }),
      expect.objectContaining({ taskId: "ship", value: expect.objectContaining({ completion: "50" }) }),
    ],
  ]);
});

it("shows editable fields immediately and stages only changes, not focus", () => {
  const change = vi.fn();
  const select = vi.fn(() => true);
  render(
    <GanttTaskTable
      tasks={tasks}
      source={source}
      selectedTaskId={undefined}
      readOnly={false}
      drafts={[]}
      onDraftChange={change}
      onSelect={select}
      onDetails={vi.fn()}
      onApply={() => undefined}
    />,
  );
  expect(screen.queryByRole("button", { name: "Edit Build" })).toBeNull();
  const name = screen.getAllByRole("textbox", { name: "Task name" })[0]!;
  fireEvent.focus(name);
  expect(select).toHaveBeenCalledWith("build");
  expect(change).not.toHaveBeenCalled();
  fireEvent.change(screen.getAllByRole("textbox", { name: "Duration" })[0]!, { target: { value: "5" } });
  expect(change).toHaveBeenCalledWith([
    expect.objectContaining({
      taskId: "build",
      value: expect.objectContaining({ duration: "5" }),
    }),
  ]);
});
