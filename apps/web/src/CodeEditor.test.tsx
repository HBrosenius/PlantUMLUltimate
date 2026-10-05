// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CodeEditor } from "./CodeEditor";
import { DEFAULT_SOURCE, DEFAULT_WBS_SOURCE, type DiagramKind } from "./model";

afterEach(cleanup);

const FIX_LABEL = "Show source fix suggestions";

function renderEditor(diagramKind: DiagramKind, value: string) {
  return <CodeEditor diagramKind={diagramKind} value={value} onChange={vi.fn()} onCursorChange={vi.fn()} />;
}

describe("CodeEditor quick fixes", () => {
  it.each(["m", "M"])("prioritizes Ctrl+Shift+%s over the built-in Ctrl+M command", (key) => {
    const rendered = render(renderEditor("class", '@startuml\nclass "Customer as Account as Other\n@enduml'));
    const content = rendered.container.querySelector(".cm-content")!;
    fireEvent.keyDown(content, { key, code: "KeyM", keyCode: 77, ctrlKey: true, shiftKey: true });
    expect(screen.getByRole("region", { name: "Error explanation" })).toHaveTextContent("unmatched quote");
  });
  it("previews the corrected line and applies the chosen task reference only", () => {
    const source =
      "@startgantt\n[Build A] lasts 2 days\n[Build B] lasts 2 days\n[Test] starts at [Build C]'s end\n@endgantt";
    const onChange = vi.fn();
    render(<CodeEditor diagramKind="gantt" value={source} onChange={onChange} onCursorChange={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(FIX_LABEL));
    const fix = screen.getByRole("button", { name: /Use task Build B/ });
    expect(fix.closest("li")).toHaveTextContent("[Test] starts at [Build B]'s end");
    expect(fix).toHaveTextContent("Apply fix");
    fireEvent.click(fix.closest("li")!.querySelector("code")!);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(fix);
    expect(onChange).toHaveBeenLastCalledWith(source.replace("[Build C]", "[Build B]"));
    expect(screen.queryByLabelText(FIX_LABEL)).not.toBeInTheDocument();
  });
  it("previews alternatives, applies only the selected fix, and refreshes when history restores the source", () => {
    const source =
      "@startgantt\n[Design] lasts 2 days\n[Build] lasts 3 days\n[Build] starts at [Design]'s\n[Build] is 50 completed\n@endgantt";
    const onChange = vi.fn();
    const rendered = render(
      <CodeEditor diagramKind="gantt" value={source} onChange={onChange} onCursorChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByLabelText(FIX_LABEL));
    const startFix = screen.getByRole("button", { name: /Use predecessor start/ });
    expect(startFix.closest("li")).toHaveTextContent("[Build] starts at [Design]'s start");
    expect(screen.getByRole("button", { name: /Use predecessor end/ })).toBeInTheDocument();
    fireEvent.click(startFix);
    expect(onChange).toHaveBeenLastCalledWith(source.replace("[Design]'s\n", "[Design]'s start\n"));
    expect(screen.queryByRole("button", { name: /Use predecessor end/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add missing %/ })).toBeInTheDocument();
    const repaired = onChange.mock.calls.at(-1)![0] as string;
    rendered.rerender(<CodeEditor diagramKind="gantt" value={repaired} onChange={onChange} onCursorChange={vi.fn()} />);
    rendered.rerender(<CodeEditor diagramKind="gantt" value={source} onChange={onChange} onCursorChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Use predecessor end/ })).toBeInTheDocument();
  });

  it("hides fix controls for a read-only document", () => {
    render(<CodeEditor diagramKind="wbs" value="* Task" readOnly onChange={vi.fn()} onCursorChange={vi.fn()} />);
    expect(screen.queryByLabelText(FIX_LABEL)).not.toBeInTheDocument();
  });

  it("does not offer stale quick fixes after switching to a new, valid WBS document", () => {
    // Creating a document from the "Choose a diagram type" dialog swaps both the kind and the source
    // in the same render. The kind effect used to compute fixes against the previous (Gantt) document,
    // and the value sync suppressed the editor's update listener, so "Fix issue (2)" stuck around.
    const view = render(renderEditor("gantt", DEFAULT_SOURCE));
    expect(screen.queryByLabelText(FIX_LABEL)).not.toBeInTheDocument();

    view.rerender(renderEditor("wbs", DEFAULT_WBS_SOURCE));

    expect(screen.queryByLabelText(FIX_LABEL)).not.toBeInTheDocument();
  });

  it("recomputes quick fixes when the value changes without a kind change", () => {
    const view = render(renderEditor("wbs", DEFAULT_WBS_SOURCE));
    expect(screen.queryByLabelText(FIX_LABEL)).not.toBeInTheDocument();

    view.rerender(renderEditor("wbs", "* Website redesign\n** Discovery"));
    expect(screen.getByLabelText(FIX_LABEL)).toHaveTextContent("Fix issue (2)");

    view.rerender(renderEditor("wbs", DEFAULT_WBS_SOURCE));
    expect(screen.queryByLabelText(FIX_LABEL)).not.toBeInTheDocument();
  });
  it("closes an open picker and clears its preview when an identical-source tab changes", () => {
    const source = "@startgant\n[Build] lasts 2 days\n@endgantt";
    const props = { diagramKind: "gantt" as const, value: source, onChange: vi.fn(), onCursorChange: vi.fn() };
    const rendered = render(<CodeEditor {...props} documentId="one" />);
    const picker = screen.getByLabelText(FIX_LABEL).closest("details")!;
    picker.open = true;
    fireEvent.focus(screen.getByRole("button", { name: /Use @startgantt/ }));
    expect(rendered.container.querySelector(".cm-fix-target")).toBeInTheDocument();
    rendered.rerender(<CodeEditor {...props} documentId="two" />);
    expect(screen.getByLabelText(FIX_LABEL).closest("details")!.open).toBe(false);
    expect(rendered.container.querySelector(".cm-fix-target")).not.toBeInTheDocument();
    expect(props.onChange).not.toHaveBeenCalled();
  });
});

it("reports explicit Apply actions separately from ordinary source typing", () => {
  const source = "@startgantt\n[Build] is 50 completed\n@endgantt";
  const onChange = vi.fn();
  const onApplyFix = vi.fn();
  render(
    <CodeEditor
      diagramKind="gantt"
      value={source}
      onChange={onChange}
      onApplyFix={onApplyFix}
      onCursorChange={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByLabelText(FIX_LABEL));
  fireEvent.click(screen.getByRole("button", { name: /Add missing %/ }));
  expect(onApplyFix).toHaveBeenCalledWith(source.replace("50 completed", "50% completed"), "Add missing %");
  expect(onChange).not.toHaveBeenCalled();
});

it("shows matching corrections immediately when explaining an error without changing source", () => {
  const source = "@startgantt\n[Build] is 50 completed\n@endgantt";
  const onChange = vi.fn();
  const rendered = render(
    <CodeEditor diagramKind="gantt" value={source} onChange={onChange} onCursorChange={vi.fn()} />,
  );
  fireEvent.keyDown(rendered.container.querySelector(".cm-content")!, {
    key: "m",
    code: "KeyM",
    keyCode: 77,
    ctrlKey: true,
    shiftKey: true,
  });
  expect(screen.getByRole("region", { name: "Error explanation" })).toBeVisible();
  expect(screen.getByRole("button", { name: /Apply fix.*Add missing %/ })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Open suggested fixes" })).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});
