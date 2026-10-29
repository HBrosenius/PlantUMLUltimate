// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Ribbon } from "./Ribbon";
import { AddDependencyDialog } from "./AddDependencyDialog";
import { parseGantt } from "@plantuml-studio/diagram-gantt";

afterEach(cleanup);
beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

it("changes categories without invoking workspace commands, and supports keyboard navigation and collapse", () => {
  const run = vi.fn();
  const view = render(
    <Ribbon
      file={<button>File</button>}
      utilities={<button>Save</button>}
      identity="Plan.puml"
      history={<button>Undo</button>}
      panels={{
        Edit: <button onClick={run}>Format</button>,
        Insert: <button>Task</button>,
        Plan: <button>Calendar</button>,
        View: <button>Outline</button>,
      }}
    />,
  );
  expect(view.getByRole("tab", { name: "Insert" }).getAttribute("aria-selected")).toBe("true");
  const edit = view.getByRole("tab", { name: "Edit" });
  fireEvent.click(edit);
  expect(run).not.toHaveBeenCalled();
  expect(view.getByRole("button", { name: "Format" })).toBeTruthy();
  edit.focus();
  fireEvent.keyDown(edit, { key: "End" });
  expect(document.activeElement).toBe(view.getByRole("tab", { name: "View" }));
  expect(view.getByRole("tab", { name: "View" }).getAttribute("aria-selected")).toBe("true");
  fireEvent.click(view.getByRole("button", { name: "Collapse ribbon" }));
  expect(view.queryByRole("tabpanel")).toBeNull();
  expect(view.getByRole("button", { name: "Save" })).toBeTruthy();
  fireEvent.click(view.getByRole("tab", { name: "Plan" }));
  expect(view.getByRole("button", { name: "Calendar" })).toBeTruthy();
});

const tasks = parseGantt("@startgantt\n[A] lasts 2 days\n[B] lasts 3 days\n@endgantt").document.tasks;
it("creates a dependency without selection and restores focus when closed", () => {
  const add = vi.fn(() => true);
  const close = vi.fn();
  const opener = document.createElement("button");
  document.body.append(opener);
  opener.focus();
  const view = render(
    <AddDependencyDialog tasks={tasks} selectedTaskId={undefined} readOnly={false} onAdd={add} onClose={close} />,
  );
  fireEvent.click(view.getByRole("button", { name: "Add dependency" }));
  expect(add).toHaveBeenCalledWith(tasks[0]!.id, tasks[1]!.id, "end", "start");
  expect(close).toHaveBeenCalledOnce();
  act(() => view.unmount());
  expect(document.activeElement).toBe(opener);
  opener.remove();
});

it("rejects self-links, handles failed operations, and enforces read-only changes", () => {
  const add = vi.fn(() => false);
  const close = vi.fn();
  const view = render(
    <AddDependencyDialog tasks={tasks} selectedTaskId={tasks[1]!.id} readOnly={false} onAdd={add} onClose={close} />,
  );
  expect((view.getByLabelText("Predecessor") as HTMLSelectElement).value).toBe(tasks[1]!.id);
  fireEvent.change(view.getByLabelText("Successor"), { target: { value: tasks[1]!.id } });
  expect((view.getByRole("button", { name: "Add dependency" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(view.getByLabelText("Successor"), { target: { value: tasks[0]!.id } });
  fireEvent.click(view.getByRole("button", { name: "Add dependency" }));
  expect(view.getByRole("alert").textContent).toContain("could not be added");
  expect(close).not.toHaveBeenCalled();
  add.mockClear();
  view.rerender(<AddDependencyDialog tasks={tasks} selectedTaskId={undefined} readOnly onAdd={add} onClose={close} />);
  fireEvent.submit(view.getByRole("button", { name: "Add dependency" }).closest("form")!);
  expect(add).not.toHaveBeenCalled();
});
