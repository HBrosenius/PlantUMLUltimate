// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiagramOutlineDialog } from "./DiagramOutlineDialog";
import { buildDiagramOutlineEntries } from "./diagram-outline";
import type { SemanticSymbolOccurrence } from "./semantic-symbol-provider";

afterEach(cleanup);

const source = "@startgantt\n[Build] lasts 3 days\n[Release] happens at [Build]'s end\n@endgantt";
const occurrences = [
  { kind: "task", key: "build", value: "Build", role: "declaration", range: { from: 12, to: 19 } },
  { kind: "task", key: "release", value: "Release", role: "declaration", range: { from: 33, to: 42 } },
  { kind: "task", key: "build", value: "Build", role: "reference", range: { from: 55, to: 62 } },
] as SemanticSymbolOccurrence[];

describe("DiagramOutlineDialog", () => {
  it("deduplicates references and keeps source order and line numbers", () => {
    expect(buildDiagramOutlineEntries(source, occurrences).map(({ label, line }) => ({ label, line }))).toEqual([
      { label: "Build", line: 2 },
      { label: "Release", line: 3 },
    ]);
  });

  it("searches elements and selects their declaration", () => {
    const onSelect = vi.fn();
    const entries = buildDiagramOutlineEntries(source, occurrences, "gantt");
    render(<DiagramOutlineDialog entries={entries} onSelect={onSelect} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Search diagram elements"), { target: { value: "release" } });
    expect(screen.queryByRole("button", { name: /Build/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Release/ }));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { type: "semantic", occurrence: expect.objectContaining({ key: "release" }) },
      }),
    );
  });

  it("navigates filtered results with arrow keys and selects with Enter", () => {
    const onSelect = vi.fn();
    render(
      <DiagramOutlineDialog
        entries={buildDiagramOutlineEntries(source, occurrences, "gantt")}
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    );

    const search = screen.getByLabelText("Search diagram elements");
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ label: "Release" }));
  });
});
