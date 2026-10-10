// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeliveryScenarioDialog } from "./DeliveryScenarioDialog";
import { EditorView } from "@codemirror/view";
import { saveDeliveryScenario } from "./saved-delivery-scenarios";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
beforeEach(() => localStorage.clear());

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
    expect(sourceEditor("Base plan source").state.readOnly).toBe(true);
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
    expect(onApply).toHaveBeenCalledWith(source.replace("3 days", "5 days"), source);
  });

  it("keeps the current preview read-only and makes the scenario preview interactive", () => {
    render(<DeliveryScenarioDialog currentSource={source} capacities={{}} onApply={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Rendered preview" }));
    expect(screen.getByText("Drag tasks in the scenario preview to see delivery impact.")).toBeTruthy();
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
    expect(screen.getByText("Change task values and choose Update scenario to see delivery impact.")).toBeTruthy();
    expect(screen.queryByText("Edit the scenario source to see delivery impact.")).toBeNull();
    expect(screen.getByText(/project duration change/).textContent).toBe("0 days project duration change");

    fireEvent.change(screen.getByLabelText("Scenario duration"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText("Scenario completion"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Add resource" }));
    fireEvent.change(screen.getByLabelText("Resource 1 name"), { target: { value: "Alice" } });
    fireEvent.click(screen.getByRole("button", { name: "Update scenario" }));

    expect(screen.getByText(/tasks changed/).parentElement?.textContent).toContain("1");
    expect(screen.getByText(/project duration change/).textContent).toBe("+3 days project duration change");
    fireEvent.click(screen.getByRole("button", { name: "Edit PlantUML source" }));
    const scenario = sourceEditor("Scenario source").state.doc.toString();
    expect(scenario).toContain("lasts 6 days");
    expect(scenario).toContain("[Build] is 50% completed");
    expect(scenario).toContain("[Build] on {Alice:100%}");
  });
});

it("saves and reopens a named scenario with assumptions without mutating the current plan", () => {
  const onApply = vi.fn(() => true),
    onClose = vi.fn();
  const props = { currentSource: source, capacities: {}, documentId: "doc-a", onApply, onClose };
  const view = render(<DeliveryScenarioDialog {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit PlantUML source" }));
  editScenario(source.replace("3 days", "5 days"));
  fireEvent.change(screen.getByLabelText("Scenario name"), { target: { value: "Longer build" } });
  fireEvent.change(screen.getByLabelText("Scenario assumptions"), { target: { value: "Allow integration time" } });
  fireEvent.click(screen.getByRole("button", { name: "Save scenario" }));
  expect(onApply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(onClose).toHaveBeenCalledOnce();
  view.unmount();
  render(<DeliveryScenarioDialog {...props} />);
  fireEvent.change(screen.getByLabelText("Saved scenario"), {
    target: { value: JSON.parse(localStorage.getItem("plantuml-studio.delivery-scenarios.v1")!).scenarios[0].id },
  });
  fireEvent.click(screen.getByRole("button", { name: "Open saved scenario" }));
  expect((screen.getByLabelText("Scenario assumptions") as HTMLTextAreaElement).value).toBe("Allow integration time");
  expect((screen.getByLabelText("Scenario duration") as HTMLInputElement).value).toBe("5");
  expect(screen.getByText(/project duration change/).textContent).toBe("+2 days project duration change");
});
it("blocks stale apply, reconciles nonoverlapping current edits and requires a new review", () => {
  const onApply = vi.fn(() => true);
  const props = { currentSource: source, capacities: {}, documentId: "doc-a", onApply, onClose: vi.fn() };
  const view = render(<DeliveryScenarioDialog {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit PlantUML source" }));
  editScenario(source.replace("3 days", "5 days"));
  fireEvent.click(screen.getByRole("button", { name: "Review and apply…" }));
  const current = source.replace("@endgantt", "' Unrelated current edit\n@endgantt");
  view.rerender(<DeliveryScenarioDialog {...props} currentSource={current} />);
  expect((screen.getByRole("button", { name: "Apply scenario" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Reconcile with current plan" }));
  fireEvent.click(screen.getByRole("button", { name: "Use reconciled scenario" }));
  expect(screen.getByLabelText("Scenario source patch").textContent).toContain("lasts 5 days");
  fireEvent.click(screen.getByRole("button", { name: "Apply scenario" }));
  expect(onApply).toHaveBeenCalledWith(current.replace("3 days", "5 days"), current);
});
it("requires explicit conflict choices before reconciling overlapping edits", () => {
  const props = {
    currentSource: source,
    capacities: {},
    documentId: "doc-a",
    onApply: vi.fn(() => true),
    onClose: vi.fn(),
  };
  const view = render(<DeliveryScenarioDialog {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit PlantUML source" }));
  editScenario(source.replace("3 days", "5 days"));
  view.rerender(<DeliveryScenarioDialog {...props} currentSource={source.replace("3 days", "4 days")} />);
  fireEvent.click(screen.getByRole("button", { name: "Reconcile with current plan" }));
  expect((screen.getByRole("button", { name: "Use reconciled scenario" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Resolve scenario conflict 1"), { target: { value: "external" } });
  fireEvent.click(screen.getByRole("button", { name: "Use reconciled scenario" }));
  expect(screen.getByLabelText("Scenario source patch").textContent).toContain("lasts 4 days");
  expect(screen.getByLabelText("Scenario source patch").textContent).toContain("lasts 5 days");
});

it("preserves unsaved work when opening another alternative is cancelled", () => {
  render(
    <DeliveryScenarioDialog
      currentSource={source}
      capacities={{}}
      documentId="doc-a"
      onApply={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit PlantUML source" }));
  editScenario(source.replace("3 days", "5 days"));
  fireEvent.click(screen.getByRole("button", { name: "New scenario from current plan" }));
  expect(screen.getByText(/Discard unsaved scenario changes before opening/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(sourceEditor("Scenario source").state.doc.toString()).toContain("lasts 5 days");
});
it("reports failed browser storage without making an edited scenario safe to close", () => {
  const onClose = vi.fn();
  render(
    <DeliveryScenarioDialog
      currentSource={source}
      capacities={{}}
      documentId="doc-a"
      onApply={vi.fn()}
      onClose={onClose}
    />,
  );
  fireEvent.change(screen.getByLabelText("Scenario name"), { target: { value: "Not saved" } });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  fireEvent.click(screen.getByRole("button", { name: "Save scenario" }));
  expect(screen.getByRole("alert").textContent).toContain("could not save");
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByText("Discard this scenario?")).toBeTruthy();
});

it("lists saved scenarios only for their original diagram identity", () => {
  const entry = { name: "Other diagram", assumptions: "", baseSource: source, source, capacities: {} };
  saveDeliveryScenario({ ...entry, documentId: "doc-b" });
  saveDeliveryScenario({ ...entry, name: "This diagram", documentId: "doc-a" });
  render(
    <DeliveryScenarioDialog
      currentSource={source}
      capacities={{}}
      documentId="doc-a"
      onApply={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(screen.queryByRole("option", { name: "Other diagram" })).toBeNull();
  expect(screen.getByRole("option", { name: "This diagram" })).toBeTruthy();
});
it("requires reconciliation when resource-capacity assumptions change", () => {
  const props = {
    currentSource: source,
    capacities: { Alice: 100 },
    documentId: "doc-a",
    onApply: vi.fn(() => true),
    onClose: vi.fn(),
  };
  const view = render(<DeliveryScenarioDialog {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit PlantUML source" }));
  editScenario(source.replace("3 days", "5 days"));
  fireEvent.click(screen.getByRole("button", { name: "Review and apply…" }));
  view.rerender(<DeliveryScenarioDialog {...props} capacities={{ Alice: 50 }} />);
  expect((screen.getByRole("button", { name: "Apply scenario" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Reconcile with current plan" }));
  fireEvent.click(screen.getByRole("button", { name: "Use reconciled scenario" }));
  expect((screen.getByRole("button", { name: "Apply scenario" }) as HTMLButtonElement).disabled).toBe(false);
});
