// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { VersionHistoryDialog } from "./VersionHistoryDialog";
import type { DocumentVersion } from "./workspace-storage";

vi.mock("./render/use-renderer", () => ({ useRenderer: () => ({ status: "idle" }) }));
afterEach(cleanup);

it("cannot set the old version as baseline while a new checkpoint is saving", async () => {
  const old: DocumentVersion = {
    id: "old",
    historyId: "history",
    source: "@startgantt\n[Old] lasts 2 days\n@endgantt",
    sourceHash: "old",
    fileName: "plan.pumlu",
    diagramKind: "gantt",
    createdAt: "2026-10-08T10:00:00Z",
    reason: "manual",
    label: "Old checkpoint",
    pinned: true,
  };
  const next = { ...old, id: "next", label: "New checkpoint", source: old.source.replace("Old", "New") };
  let finish!: (version: DocumentVersion) => void;
  const onSetBaseline = vi.fn(async () => {});
  const props = {
    versions: [old],
    currentSource: next.source,
    onCreate: () =>
      new Promise<DocumentVersion>((resolve) => {
        finish = resolve;
      }),
    onRestore: vi.fn(async () => {}),
    onUpdate: vi.fn(async () => {}),
    onDelete: vi.fn(async () => {}),
    onSetBaseline,
    diagramKind: "gantt" as const,
    fileName: old.fileName,
    onApplyReview: vi.fn(async () => true),
    onClose: vi.fn(),
  };
  const view = render(<VersionHistoryDialog {...props} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Create version" }));
  const baseline = screen.getByRole("button", { name: "Set as baseline" });
  expect(baseline).toBeDisabled();
  await user.click(baseline);
  expect(onSetBaseline).not.toHaveBeenCalled();
  view.rerender(<VersionHistoryDialog {...props} versions={[next, old]} />);
  await act(async () => finish(next));
  await waitFor(() => expect(baseline).toBeEnabled());
  await user.click(baseline);
  expect(onSetBaseline).toHaveBeenCalledWith(next);
});
