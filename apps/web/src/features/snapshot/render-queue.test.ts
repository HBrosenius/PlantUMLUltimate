import { describe, expect, it, vi } from "vitest";
import type { SharedDocument } from "../../shared-document";
import {
  renderDiagramQueue,
  snapshotRelations,
  SnapshotCancelled,
  type QueueDiagram,
  type QueueProgress,
  type RenderOutcome,
} from "./render-queue";

const diagrams: QueueDiagram[] = [1, 2, 3].map((n) => ({
  id: `d${n}`,
  title: `D${n}`,
  kind: "gantt",
  source: `s${n}`,
}));

describe("renderDiagramQueue", () => {
  it("renders in order, one at a time, and reports progress", async () => {
    const order: string[] = [];
    let running = 0;
    let maxRunning = 0;
    const progress: QueueProgress[] = [];
    const results = await renderDiagramQueue(diagrams, {
      render: async (diagram) => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        order.push(diagram.id);
        await new Promise((resolve) => setTimeout(resolve, 1));
        running--;
        return { svg: `<svg>${diagram.id}</svg>` };
      },
      onProgress: (value) => progress.push({ ...value }),
    });
    expect(order).toEqual(["d1", "d2", "d3"]);
    expect(maxRunning).toBe(1);
    expect(results.map((entry) => entry.svg)).toEqual(["<svg>d1</svg>", "<svg>d2</svg>", "<svg>d3</svg>"]);
    expect(progress.map((value) => [value.done, value.total, value.current?.id])).toEqual([
      [0, 3, "d1"],
      [1, 3, "d2"],
      [2, 3, "d3"],
      [3, 3, undefined],
    ]);
  });

  it("reuses a result that is already current instead of rendering again", async () => {
    const render = vi.fn(async (_diagram: QueueDiagram, _signal: AbortSignal): Promise<RenderOutcome> => ({
      svg: "<svg>new</svg>",
    }));
    const results = await renderDiagramQueue(diagrams, {
      render,
      reuse: (diagram) => (diagram.id === "d2" ? "<svg>current</svg>" : undefined),
    });
    expect(render.mock.calls.map(([diagram]) => diagram.id)).toEqual(["d1", "d3"]);
    expect(results[1]).toMatchObject({ id: "d2", svg: "<svg>current</svg>", reused: true });
    expect(results[0]!.reused).toBeUndefined();
  });

  it("turns a failed or throwing diagram into an error entry and carries on", async () => {
    const results = await renderDiagramQueue(diagrams, {
      render: async (diagram) => {
        if (diagram.id === "d1") return { error: "Syntax error" };
        if (diagram.id === "d2") throw new Error("Engine crashed");
        return { svg: "<svg/>" };
      },
    });
    expect(results.map((entry) => [entry.id, entry.svg, entry.error])).toEqual([
      ["d1", undefined, "Syntax error"],
      ["d2", undefined, "Engine crashed"],
      ["d3", "<svg/>", undefined],
    ]);
  });

  it("stops when cancelled, aborts the running render and renders nothing further", async () => {
    const controller = new AbortController();
    const started: string[] = [];
    let seenSignal: AbortSignal | undefined;
    const queue = renderDiagramQueue(diagrams, {
      signal: controller.signal,
      render: (diagram, signal) =>
        new Promise<RenderOutcome>((resolve, reject) => {
          started.push(diagram.id);
          seenSignal = signal;
          if (diagram.id === "d1") resolve({ svg: "<svg/>" });
          else signal.addEventListener("abort", () => reject(new SnapshotCancelled()));
        }),
    });
    await vi.waitFor(() => expect(started).toEqual(["d1", "d2"]));
    controller.abort();
    await expect(queue).rejects.toBeInstanceOf(SnapshotCancelled);
    expect(seenSignal!.aborted).toBe(true);
    expect(started).toEqual(["d1", "d2"]);
  });

  it("does not start when already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const render = vi.fn();
    await expect(renderDiagramQueue(diagrams, { render, signal: controller.signal })).rejects.toBeInstanceOf(
      SnapshotCancelled,
    );
    expect(render).not.toHaveBeenCalled();
  });

  it("returns an empty list for no diagrams", async () => {
    expect(await renderDiagramQueue([], { render: vi.fn() })).toEqual([]);
  });
});

describe("snapshotRelations", () => {
  const shared = {
    id: "p",
    name: "P",
    diagrams: ["a", "b", "c"].map((letter) => ({ id: `id-${letter}`, documentId: `doc-${letter}` })),
    elements: [
      { id: "e1", documentId: "doc-a" },
      { id: "e2", documentId: "doc-b" },
      { id: "e3", documentId: "doc-b" },
      { id: "e4", documentId: "doc-gone" },
    ],
    links: [
      { id: "l1", kind: "implements", from: "e1", to: "e2" },
      { id: "l2", kind: "relates", from: "e2", to: "e3" },
      { id: "l3", kind: "represents", from: "e1", to: "e4" },
      { id: "l4", kind: "represents", from: "e3", to: "e1" },
    ],
  } as unknown as SharedDocument;
  it("maps element links to diagram indexes and drops self and dangling links", () => {
    expect(snapshotRelations(shared)).toEqual([
      { from: 0, to: 1, kind: "implements" },
      { from: 1, to: 0, kind: "represents" },
    ]);
  });
});
