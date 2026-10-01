// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HistoryMenu } from "./HistoryMenu";

afterEach(cleanup);

describe("HistoryMenu", () => {
  it("undoes or redoes every step up to the chosen one", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    render(
      <HistoryMenu
        undoSteps={["Rename task", "Move task", "Add task"]}
        redoSteps={["Change colour"]}
        onUndo={onUndo}
        onRedo={onRedo}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Recent changes" }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Change colour",
      "Rename task",
      "Move task",
      "Add task",
    ]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Move task" }));
    expect(onUndo).toHaveBeenCalledWith(2);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Recent changes" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Change colour" }));
    expect(onRedo).toHaveBeenCalledWith(1);
  });

  it("is disabled without history and closes on Escape", () => {
    const { rerender } = render(<HistoryMenu undoSteps={[]} redoSteps={[]} onUndo={vi.fn()} onRedo={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Recent changes" })).toBeDisabled();
    rerender(<HistoryMenu undoSteps={["Add task"]} redoSteps={[]} onUndo={vi.fn()} onRedo={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Recent changes" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recent changes" })).toHaveFocus();
  });
});
