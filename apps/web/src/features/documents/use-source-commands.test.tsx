// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceHistory } from "@plantuml-studio/editor-core";
import { DEFAULT_WORKSPACE } from "../../workspace-storage";
import { useSourceCommands, type SourceProblemPreview } from "./use-source-commands";

const initialSource = "@startgantt\n[First task] lasts 1 day\n@endgantt";
const changedSource = "@startgantt\n[First task] lasts 2 days\n@endgantt";

afterEach(cleanup);

function Harness({
  readOnly = false,
  candidate = changedSource,
  history,
  captureBeforeCommit,
  refreshHistoryControls,
}: {
  readOnly?: boolean;
  candidate?: string;
  history: SourceHistory;
  captureBeforeCommit: () => void;
  refreshHistoryControls: () => void;
}) {
  const [workspace, setWorkspace] = useState({ ...DEFAULT_WORKSPACE, source: initialSource });
  const [message, setMessage] = useState<string>();
  const [problemPreview, setProblemPreview] = useState<SourceProblemPreview>();
  const [problemsOpen, setProblemsOpen] = useState(false);
  const { commitGeneratedSource, undo, redo } = useSourceCommands({
    source: workspace.source,
    diagramKind: workspace.diagramKind,
    readOnly,
    history,
    setWorkspace,
    setInteractionMessage: setMessage,
    setProblemPreview,
    setProblemsOpen,
    captureBeforeCommit,
    refreshHistoryControls,
  });

  return (
    <>
      <button onClick={() => commitGeneratedSource(candidate, "Update task")}>Commit</button>
      <button onClick={undo}>Undo</button>
      <button onClick={redo}>Redo</button>
      <output data-testid="source">{workspace.source}</output>
      <output data-testid="message">{message}</output>
      <output data-testid="problem">{problemPreview?.message}</output>
      <output data-testid="problems-open">{String(problemsOpen)}</output>
    </>
  );
}

describe("useSourceCommands", () => {
  it("records a valid generated edit after capturing focus", () => {
    const history = new SourceHistory();
    const captureBeforeCommit = vi.fn();
    const refreshHistoryControls = vi.fn();
    render(
      <Harness
        history={history}
        captureBeforeCommit={captureBeforeCommit}
        refreshHistoryControls={refreshHistoryControls}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Commit" }));

    expect(screen.getByTestId("source").textContent).toBe(changedSource);
    expect(captureBeforeCommit).toHaveBeenCalledOnce();
    expect(refreshHistoryControls).toHaveBeenCalledOnce();
    expect(history.undo(changedSource)).toBe(initialSource);
  });

  it("rejects an invalid generated edit without entering history", () => {
    const history = new SourceHistory();
    const captureBeforeCommit = vi.fn();
    const refreshHistoryControls = vi.fn();
    render(
      <Harness
        candidate="[First task] lasts 2 days"
        history={history}
        captureBeforeCommit={captureBeforeCommit}
        refreshHistoryControls={refreshHistoryControls}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Commit" }));

    expect(screen.getByTestId("source").textContent).toBe(initialSource);
    expect(screen.getByTestId("message")).toHaveTextContent("Cancelled update task");
    expect(screen.getByTestId("problem")).not.toBeEmptyDOMElement();
    expect(screen.getByTestId("problems-open")).toHaveTextContent("true");
    expect(captureBeforeCommit).not.toHaveBeenCalled();
    expect(refreshHistoryControls).not.toHaveBeenCalled();
    expect(history.canUndo).toBe(false);
  });

  it("rejects viewer edits before changing focus or history", () => {
    const history = new SourceHistory();
    const captureBeforeCommit = vi.fn();
    const refreshHistoryControls = vi.fn();
    render(
      <Harness
        readOnly
        history={history}
        captureBeforeCommit={captureBeforeCommit}
        refreshHistoryControls={refreshHistoryControls}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Commit" }));

    expect(screen.getByTestId("source").textContent).toBe(initialSource);
    expect(screen.getByTestId("message")).toHaveTextContent("Viewing only");
    expect(captureBeforeCommit).not.toHaveBeenCalled();
    expect(refreshHistoryControls).not.toHaveBeenCalled();
    expect(history.canUndo).toBe(false);
  });

  it("undoes and redoes only the active history", () => {
    const history = new SourceHistory();
    const otherHistory = new SourceHistory();
    otherHistory.record(initialSource, "other document", "Other edit");
    const refreshHistoryControls = vi.fn();
    render(<Harness history={history} captureBeforeCommit={vi.fn()} refreshHistoryControls={refreshHistoryControls} />);

    fireEvent.click(screen.getByRole("button", { name: "Commit" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByTestId("source").textContent).toBe(initialSource);
    expect(otherHistory.canUndo).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(screen.getByTestId("source").textContent).toBe(changedSource);
    expect(otherHistory.canUndo).toBe(true);
    expect(refreshHistoryControls).toHaveBeenCalledTimes(3);
  });

  it("rejects viewer undo and redo without consuming history", () => {
    const history = new SourceHistory();
    history.record(initialSource, changedSource, "Update task");
    const refreshHistoryControls = vi.fn();
    render(
      <Harness
        readOnly
        candidate={initialSource}
        history={history}
        captureBeforeCommit={vi.fn()}
        refreshHistoryControls={refreshHistoryControls}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByTestId("message")).toHaveTextContent("undo is available only to editors");
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(screen.getByTestId("message")).toHaveTextContent("redo is available only to editors");
    expect(history.canUndo).toBe(true);
    expect(refreshHistoryControls).not.toHaveBeenCalled();
  });
});
