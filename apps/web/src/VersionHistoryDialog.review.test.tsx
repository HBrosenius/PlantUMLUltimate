// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { VersionHistoryDialog } from "./VersionHistoryDialog";
import type { DocumentVersion } from "./workspace-storage";
vi.mock("./render/use-renderer", () => ({ useRenderer: () => ({ status: "idle" }) }));
afterEach(cleanup);
const before = "@startgantt\n[A] lasts 2 days\n\n[A] is 0% complete\n@endgantt";
const after = before.replace("2 days", "3 days").replace("0%", "20%");
function props(currentSource = before) {
  const version: DocumentVersion = {
    id: "base",
    historyId: "history",
    source: before,
    sourceHash: "base",
    fileName: "plan.pumlu",
    diagramKind: "gantt",
    createdAt: "2026-10-10T00:00:00Z",
    reason: "manual",
    label: "Base",
    pinned: true,
  };
  return {
    versions: [version, { ...version, id: "proposal", source: after, label: "Proposal" }],
    currentSource,
    diagramKind: "gantt" as const,
    fileName: "plan.pumlu",
    onCreate: vi.fn(async () => version),
    onRestore: vi.fn(async () => {}),
    onUpdate: vi.fn(async () => {}),
    onDelete: vi.fn(async () => {}),
    onSetBaseline: vi.fn(async () => {}),
    onApplyReview: vi.fn(async () => true),
    onClose: vi.fn(),
  };
}
it("applies a selected valid proposal with the exact expected working source", async () => {
  const p = props();
  render(<VersionHistoryDialog {...p} />);
  await userEvent.selectOptions(screen.getByLabelText("Compare with"), "proposal");
  await userEvent.click(screen.getByRole("checkbox", { name: "Select Change A duration from 2 to 3 days" }));
  await userEvent.click(screen.getByRole("button", { name: "Apply selected (1)" }));
  expect(p.onApplyReview).toHaveBeenCalledWith(before.replace("2 days", "3 days"), before);
});
it("blocks a comparison when the working source is neither reviewed revision", async () => {
  const p = props();
  const { rerender } = render(<VersionHistoryDialog {...p} />);
  await userEvent.selectOptions(screen.getByLabelText("Compare with"), "proposal");
  await userEvent.click(screen.getByRole("checkbox", { name: "Select Change A duration from 2 to 3 days" }));
  rerender(<VersionHistoryDialog {...p} currentSource={before.replace("2 days", "4 days")} />);
  expect(screen.getByRole("button", { name: /Apply selected/ })).toBeDisabled();
  expect(p.onApplyReview).not.toHaveBeenCalled();
});
it("requires explicit replacement acknowledgement when excluding current differences", async () => {
  const p = props(after);
  render(<VersionHistoryDialog {...p} />);
  await userEvent.click(screen.getByRole("checkbox", { name: "Select Change A duration from 2 to 3 days" }));
  expect(screen.getByRole("button", { name: "Apply selected (1)" })).toBeDisabled();
  await userEvent.click(screen.getByRole("checkbox", { name: /Replace the working copy with this selection/ }));
  expect(screen.getByRole("button", { name: "Apply selected (1)" })).toBeEnabled();
});
it("prevents applying a task removal while its dependency remains", async () => {
  const base = "@startgantt\n[A] lasts 2 days\n\n[B] lasts 1 day\n[B] starts at [A]'s end\n@endgantt";
  const p = props(base);
  p.versions[0]!.source = base;
  p.versions[1]!.source = "@startgantt\n\n[B] lasts 1 day\n@endgantt";
  render(<VersionHistoryDialog {...p} />);
  await userEvent.selectOptions(screen.getByLabelText("Compare with"), "proposal");
  await userEvent.click(screen.getByRole("checkbox", { name: "Select Remove task A" }));
  expect(screen.getByRole("button", { name: "Apply selected (1)" })).toBeDisabled();
  expect(screen.getByRole("alert").textContent).toContain("Select related groups together");
});
it("disables review application for viewers", async () => {
  const p = props();
  render(<VersionHistoryDialog {...p} readOnly />);
  await userEvent.selectOptions(screen.getByLabelText("Compare with"), "proposal");
  await userEvent.click(screen.getByRole("checkbox", { name: "Select Change A duration from 2 to 3 days" }));
  expect(screen.getByRole("button", { name: "Apply selected (1)" })).toBeDisabled();
});
