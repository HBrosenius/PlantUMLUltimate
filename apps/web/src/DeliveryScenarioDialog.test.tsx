// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeliveryScenarioDialog } from "./DeliveryScenarioDialog";
import { EditorView } from "@codemirror/view";

afterEach(cleanup);

const source = `@startgantt
Project starts 2026-09-01
[Build] lasts 3 days
[Release] happens at [Build]'s end
@endgantt`;

function sourceEditor(label: string): EditorView {
  const content = screen.getByLabelText(label);
  const editor = EditorView.findFromDOM(content);
  if (!editor) throw new Error(`Missing ${label} CodeMirror view`);
  return editor;
}

function editScenario(value: string): void {
  const editor = sourceEditor("Scenario source");
  act(() => editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } }));
}

describe("DeliveryScenarioDialog", () => {
  it("keeps the current plan immutable and updates impact from scenario edits", () => {
    render(<DeliveryScenarioDialog currentSource={source} capacities={{}} onApply={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit PlantUML source" }));
    expect(sourceEditor("Current plan source").state.readOnly).toBe(true);
    expect(sourceEditor("Scenario source").state.readOnly).toBe(false);
    expect(screen.getByLabelText("Scenario source").getAttribute("data-language")).toBe("plantuml-gantt");
    expect(screen.getByText(/will not change until you review and apply/)).toBeTruthy();
    expect(screen.getByText("Edit the scenario source to see delivery impact.")).toBeTruthy();
    editScenario(source.replace("3 days", "5 days"));
    expect(screen.getByRole("heading", { name: "Milestones" }).closest("section")?.textContent).toContain("+2 days");
    expect(screen.getByText(/Because:/).textContent).toContain("Changed duration");
  });

  it("resets the scenario and closes explicitly", () => {
    const onClose = vi.fn();
    render(<DeliveryScenarioDialog currentSource={source} capacities={{}} onApply={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit PlantUML source" }));
    editScenario(source.replace("3 days", "7 days"));
    fireEvent.click(screen.getByRole("button", { name: "Reset scenario" }));
    expect(sourceEditor("Scenario source").state.doc.toString()).toBe(source);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("requires source review before applying the scenario", () => {
    const onApply = vi.fn(() => true);
    render(<DeliveryScenarioDialog currentSource={source} capacities={{}} onApply={onApply} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit PlantUML source" }));
    editScenario(source.replace("3 days", "5 days"));
    fireEvent.click(screen.getByRole("button", { name: "Review and apply…" }));
    expect(screen.getByLabelText("Scenario source patch").textContent).toContain("[Build] lasts 5 days");
    expect(screen.getByLabelText("Scenario source patch").textContent).toContain("[Build] lasts 3 days");
    expect(screen.getByRole("button", { name: "Back to editing" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply scenario" }));
    expect(onApply).toHaveBeenCalledWith(source.replace("3 days", "5 days"));
  });

  it("keeps the current preview read-only and makes the scenario preview interactive", () => {
    render(<DeliveryScenarioDialog currentSource={source} capacities={{}} onApply={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Rendered preview" }));
    const canvases = document.querySelectorAll(".scenario-render-canvas.version-render-canvas");
    expect(canvases).toHaveLength(1);
    expect(
      screen.getByLabelText("Scenario preview").querySelector(".scenario-interactive-canvas .preview"),
    ).toBeTruthy();
  });

  it("warns before closing a scenario with unapplied changes", () => {
    const onClose = vi.fn();
    render(<DeliveryScenarioDialog currentSource={source} capacities={{}} onApply={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit PlantUML source" }));
    editScenario(source.replace("3 days", "5 days"));

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Discard this scenario?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByText("Discard this scenario?")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("updates a task through structured controls without editing PlantUML", () => {
    render(<DeliveryScenarioDialog currentSource={source} capacities={{}} onApply={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Task controls" }).className).toContain("active");

    fireEvent.change(screen.getByLabelText("Scenario duration"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText("Scenario completion"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Add resource" }));
    fireEvent.change(screen.getByLabelText("Resource 1 name"), { target: { value: "Alice" } });
    fireEvent.click(screen.getByRole("button", { name: "Update scenario" }));

    expect(screen.getByText(/tasks changed/).parentElement?.textContent).toContain("1");
    fireEvent.click(screen.getByRole("button", { name: "Edit PlantUML source" }));
    const scenario = sourceEditor("Scenario source").state.doc.toString();
    expect(scenario).toContain("lasts 6 days");
    expect(scenario).toContain("[Build] is 50% completed");
    expect(scenario).toContain("[Build] on {Alice:100%}");
  });
});
