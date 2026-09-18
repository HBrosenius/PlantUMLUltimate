// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CodeEditor } from "./CodeEditor";
import { DEFAULT_SOURCE, DEFAULT_WBS_SOURCE, type DiagramKind } from "./model";

afterEach(cleanup);

const FIX_BUTTON = { name: "Fix nearest source issue" };

function renderEditor(diagramKind: DiagramKind, value: string) {
  return <CodeEditor diagramKind={diagramKind} value={value} onChange={vi.fn()} onCursorChange={vi.fn()} />;
}

describe("CodeEditor quick fixes", () => {
  it("does not offer stale quick fixes after switching to a new, valid WBS document", () => {
    // Creating a document from the "Choose a diagram type" dialog swaps both the kind and the source
    // in the same render. The kind effect used to compute fixes against the previous (Gantt) document,
    // and the value sync suppressed the editor's update listener, so "Fix issue (2)" stuck around.
    const view = render(renderEditor("gantt", DEFAULT_SOURCE));
    expect(screen.queryByRole("button", FIX_BUTTON)).not.toBeInTheDocument();

    view.rerender(renderEditor("wbs", DEFAULT_WBS_SOURCE));

    expect(screen.queryByRole("button", FIX_BUTTON)).not.toBeInTheDocument();
  });

  it("recomputes quick fixes when the value changes without a kind change", () => {
    const view = render(renderEditor("wbs", DEFAULT_WBS_SOURCE));
    expect(screen.queryByRole("button", FIX_BUTTON)).not.toBeInTheDocument();

    view.rerender(renderEditor("wbs", "* Website redesign\n** Discovery"));
    expect(screen.getByRole("button", FIX_BUTTON)).toHaveTextContent("Fix issue (2)");

    view.rerender(renderEditor("wbs", DEFAULT_WBS_SOURCE));
    expect(screen.queryByRole("button", FIX_BUTTON)).not.toBeInTheDocument();
  });
});
