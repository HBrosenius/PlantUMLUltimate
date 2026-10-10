// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LinkedWorkPreviewDialog } from "./LinkedWorkPreviewDialog";

afterEach(cleanup);
const diagrams = [
  { id: "wbs", name: "Breakdown", before: "old", after: "new" },
  { id: "gantt", name: "Schedule", before: "same", after: "same" },
];
it("shows consequences for both diagrams and cancels without applying", () => {
  const apply = vi.fn(() => true);
  const onClose = vi.fn();
  render(
    <LinkedWorkPreviewDialog
      preview={{ label: "Build", diagrams, warnings: ["Check dates"], apply }}
      current
      onClose={onClose}
    />,
  );
  expect(screen.getByLabelText("Changes to Breakdown").textContent).toContain("new");
  expect(screen.getByText("Source unchanged")).toBeTruthy();
  expect(screen.getByText("Check dates")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(apply).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledOnce();
});
it("blocks stale previews and keeps a rejected application open", () => {
  const apply = vi.fn(() => false);
  const onClose = vi.fn();
  const preview = { label: "Build", diagrams, warnings: [], apply };
  const { rerender } = render(<LinkedWorkPreviewDialog preview={preview} current={false} onClose={onClose} />);
  fireEvent.click(screen.getByRole("button", { name: "Apply linked work" }));
  expect(apply).not.toHaveBeenCalled();
  rerender(<LinkedWorkPreviewDialog preview={preview} current onClose={onClose} />);
  fireEvent.click(screen.getByRole("button", { name: "Apply linked work" }));
  expect(apply).toHaveBeenCalledOnce();
  expect(onClose).not.toHaveBeenCalled();
});
