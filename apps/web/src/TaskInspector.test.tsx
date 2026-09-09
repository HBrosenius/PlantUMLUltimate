// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseGanttCalendar } from "./gantt-calendar";
import { TaskInspector } from "./TaskInspector";

afterEach(cleanup);

describe("TaskInspector", () => {
  it("associates task-name validation with its field and only applies valid values", async () => {
    const user = userEvent.setup();
    const source = "@startgantt\n[Build] starts 2026-09-01\n[Build] lasts 2 days\n@endgantt";
    const task = parseGantt(source).document.tasks[0]!;
    const onApply = vi.fn();
    render(
      <TaskInspector
        task={task}
        tasks={[task]}
        predecessorId=""
        dependencyRelation="start-after-end"
        effectiveStart="2026-09-01"
        effectiveEnd="2026-09-02"
        calendar={parseGanttCalendar(source)}
        resourceNames={[]}
        conflicts={[]}
        onApply={onApply}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("complementary", { name: "Task inspector" })).toBeInTheDocument();
    const name = screen.getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.tab();

    const error = screen.getByRole("alert");
    expect(error).toHaveTextContent("Enter a task name.");
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription("Enter a task name.");
    expect(onApply).not.toHaveBeenCalled();

    await user.click(name);
    await user.type(name, "Compile");
    await user.tab();
    expect(screen.queryByText("Enter a task name.")).not.toBeInTheDocument();
    expect(name).toHaveAttribute("aria-invalid", "false");
    expect(onApply).toHaveBeenCalledOnce();
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ label: "Compile" }));
  });
});
