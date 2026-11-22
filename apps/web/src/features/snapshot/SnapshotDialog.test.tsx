// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { SharedDocument } from "../../shared-document";
import { SnapshotDialog } from "./SnapshotDialog";
import { SnapshotCancelled, type QueueDiagram, type RenderOutcome, type RenderedDiagram } from "./render-queue";

const pending: Array<{ diagram: QueueDiagram; resolve: (outcome: RenderOutcome) => void }> = [];
vi.mock("./use-snapshot-renderer", () => ({
  useSnapshotRenderer: () => ({
    render: (diagram: QueueDiagram, signal: AbortSignal) =>
      new Promise<RenderOutcome>((resolve, reject) => {
        pending.push({ diagram, resolve });
        signal.addEventListener("abort", () => reject(new SnapshotCancelled()));
      }),
    release: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  pending.length = 0;
});

const shared = {
  id: "p",
  name: "Plan",
  elements: [],
  links: [],
  diagrams: [1, 2, 3].map((n) => ({
    id: `d${n}`,
    name: `Diagram ${n}`,
    documentId: `doc${n}`,
    kind: "sequence",
    source: `source ${n}`,
  })),
} as unknown as SharedDocument;

const setup = () => {
  const onThisDiagram = vi.fn(async () => {});
  const onDocument = vi.fn(async (_rendered: readonly RenderedDiagram[]) => {});
  const onClose = vi.fn();
  render(
    <SnapshotDialog
      document={shared}
      activeDiagramId="d1"
      activeResult={{
        requestId: 1,
        source: "source 1",
        documentId: "tab",
        durationMs: 1,
        svg: "<svg>active</svg>",
      }}
      onThisDiagram={onThisDiagram}
      onDocument={onDocument}
      onClose={onClose}
    />,
  );
  return { onThisDiagram, onDocument, onClose };
};

it("defaults to the whole document, shows progress, and passes every rendered diagram on", async () => {
  const user = userEvent.setup();
  const { onDocument, onClose } = setup();
  expect((screen.getByRole("radio", { name: "Whole document (3 diagrams)" }) as HTMLInputElement).checked).toBe(true);
  await user.click(screen.getByRole("button", { name: "Create snapshot" }));
  // The active diagram's current preview is reused, so the renderer is first asked for diagram 2.
  await waitFor(() => expect(pending).toHaveLength(1));
  expect(pending[0]!.diagram.id).toBe("d2");
  expect(screen.getByRole("status").textContent).toBe("Rendering diagram 2 of 3: Diagram 2");
  expect(screen.getByRole("progressbar")).toBeTruthy();
  pending[0]!.resolve({ svg: "<svg>two</svg>" });
  await waitFor(() => expect(pending).toHaveLength(2));
  pending[1]!.resolve({ error: "Syntax error" });
  await waitFor(() => expect(onDocument).toHaveBeenCalledTimes(1));
  const rendered = onDocument.mock.calls[0]![0];
  expect(rendered.map((entry) => [entry.id, entry.svg, entry.error, entry.reused])).toEqual([
    ["d1", "<svg>active</svg>", undefined, true],
    ["d2", "<svg>two</svg>", undefined, undefined],
    ["d3", undefined, "Syntax error", undefined],
  ]);
  await waitFor(() => expect(onClose).toHaveBeenCalled());
});

it("cancels a running snapshot without building a file", async () => {
  const user = userEvent.setup();
  const { onDocument, onClose } = setup();
  await user.click(screen.getByRole("button", { name: "Create snapshot" }));
  await waitFor(() => expect(pending).toHaveLength(1));
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull());
  expect((screen.getByRole("button", { name: "Create snapshot" }) as HTMLButtonElement).disabled).toBe(false);
  expect(onDocument).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});

it("exports only the active diagram when asked to", async () => {
  const user = userEvent.setup();
  const { onThisDiagram, onDocument, onClose } = setup();
  await user.click(screen.getByRole("radio", { name: "This diagram" }));
  await user.click(screen.getByRole("button", { name: "Create snapshot" }));
  await waitFor(() => expect(onThisDiagram).toHaveBeenCalledTimes(1));
  expect(onDocument).not.toHaveBeenCalled();
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(pending).toHaveLength(0);
});
