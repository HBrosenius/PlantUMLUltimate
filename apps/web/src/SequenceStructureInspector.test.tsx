// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import type { SequenceFragment } from "@plantuml-studio/diagram-sequence";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SequenceStructureInspector } from "./SequenceStructureInspector";

afterEach(cleanup);

const fragment: SequenceFragment = {
  id: "fragment-1",
  kind: "alt",
  label: "ok",
  branches: [{ label: "first" }, { label: "second" }, { label: "third" }],
  sourceRange: { from: 0, to: 10 },
};

const renderInspector = () => {
  const onApply = vi.fn();
  render(
    <SequenceStructureInspector
      structure={fragment}
      participants={["A", "B"]}
      anchors={[]}
      onApply={onApply}
      onDelete={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  return onApply;
};

const branchLabels = () =>
  [...document.querySelectorAll<HTMLInputElement>(".sequence-branch-row input[aria-label$='label']")].map(
    (input) => input.value,
  );

describe("FragmentForm branch reordering", () => {
  it("keeps focus on the moved branch so repeated Enter keeps moving it", async () => {
    const user = userEvent.setup();
    const onApply = renderInspector();
    screen.getByRole("button", { name: "Move branch 4 up" }).focus();
    await user.keyboard("{Enter}");
    expect(branchLabels()).toEqual(["first", "third", "second"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Move branch 3 up" }));

    await user.keyboard("{Enter}");
    expect(branchLabels()).toEqual(["third", "first", "second"]);
    // Up is now disabled at the top, so focus falls back to the moved row's Move down button.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Move branch 2 down" }));

    fireEvent.submit(document.querySelector("form")!);
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        branches: [
          { label: "third", originalIndex: 2 },
          { label: "first", originalIndex: 0 },
          { label: "second", originalIndex: 1 },
        ],
      }),
    );
  });

  it("preserves the branch origin when its color changes", () => {
    const onApply = renderInspector();
    fireEvent.change(screen.getByRole("combobox", { name: "Branch 3 color" }), { target: { value: "#Pink" } });
    fireEvent.submit(document.querySelector("form")!);
    expect(onApply.mock.calls[0]![0].branches[1]).toEqual({ label: "second", originalIndex: 1, color: "#Pink" });
  });
});
