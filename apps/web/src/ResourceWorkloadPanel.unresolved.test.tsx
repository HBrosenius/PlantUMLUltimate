// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { ResourceWorkloadPanel } from "./ResourceWorkloadPanel";
import { parseGanttCalendar } from "./gantt-calendar";
import { resolveTaskDates } from "./gantt-schedule";

afterEach(cleanup);

it("shows why a resource task was excluded and lets the user select it", () => {
  const source =
    "@startgantt\nProject starts 2026-09-21\n[Broken] on {Alice} starts 2026-09-21\n[Broken] ends $unknown\n[Broken] lasts 2 days\n@endgantt";
  const document = parseGantt(source).document;
  const calendar = parseGanttCalendar(source);
  const resolvedDates = resolveTaskDates(document.tasks, document.dependencies, document.projectStart?.value, calendar);
  const onTaskSelect = vi.fn();
  render(
    <ResourceWorkloadPanel
      tasks={document.tasks}
      resolvedDates={resolvedDates}
      calendar={calendar}
      capacities={{ Alice: 100 }}
      onCapacityChange={vi.fn()}
      onRename={vi.fn()}
      onFilter={vi.fn()}
      onTaskSelect={onTaskSelect}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByText("1 unscheduled task excluded from workload")).toBeTruthy();
  const capacity = screen.getByRole("spinbutton", { name: "Capacity for Alice" }) as HTMLInputElement;
  expect(capacity.checkValidity()).toBe(true);
  capacity.value = "50";
  expect(capacity.checkValidity()).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Broken: End date cannot be resolved: $unknown" }));
  expect(onTaskSelect).toHaveBeenCalledWith("broken");
  expect(screen.queryByText(/over-allocation/)).toBeNull();
});

it("offers assignment and an explicit coordinator summary before people are assigned", () => {
  const source = "@startgantt\n[A] lasts 2 days\n@endgantt";
  const onReport = vi.fn();
  const onTaskSelect = vi.fn();
  render(
    <ResourceWorkloadPanel
      tasks={parseGantt(source).document.tasks}
      calendar={parseGanttCalendar(source)}
      capacities={{}}
      onCapacityChange={vi.fn()}
      onRename={vi.fn()}
      onFilter={vi.fn()}
      onTaskSelect={onTaskSelect}
      onReport={onReport}
      onClose={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Create coordinator summary" }));
  expect(onReport).toHaveBeenCalledWith(undefined, true);
  fireEvent.click(screen.getByRole("button", { name: "Open task assignment" }));
  expect(onTaskSelect).toHaveBeenCalledWith("a");
});
