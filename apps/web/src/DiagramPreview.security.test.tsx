// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StrictMode, type ComponentProps } from "react";
import { DiagramPreview } from "./DiagramPreview";
import * as ganttOverlay from "./render/canonical-gantt-overlay";
import * as sanitizeSvg from "./render/sanitize-svg";

afterEach(cleanup);

it("keeps overlays aligned with the displayed render while source changes", () => {
  const overlay = vi.spyOn(ganttOverlay, "addCanonicalGanttOverlay");
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>Old task</text></svg>';
  const oldSource = "@startgantt\n[Old task] lasts 2 days\n@endgantt";
  const nextSource = "@startgantt\n[New task] lasts 3 days\n@endgantt";
  try {
    const view = render(preview(svg, undefined, { source: oldSource, renderedSource: oldSource }));
    expect(overlay).toHaveBeenCalledTimes(1);
    expect(overlay.mock.calls[0]?.[1]?.[0]?.label).toBe("Old task");
    const originalSvg = view.container.querySelector(".diagram-svg-host svg");
    view.rerender(
      preview(svg, undefined, { source: nextSource, renderedSource: oldSource, renderStatus: "rendering" }),
    );
    expect(overlay).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector(".diagram-svg-host svg")).toBe(originalSvg);
    view.rerender(
      preview(svg.replace("Old task", "New task"), undefined, { source: nextSource, renderedSource: nextSource }),
    );
    expect(overlay).toHaveBeenCalledTimes(2);
    expect(overlay.mock.calls[1]?.[1]?.[0]?.label).toBe("New task");
    expect(view.container.querySelector(".diagram-svg-host svg")?.textContent).toBe("New task");
  } finally {
    overlay.mockRestore();
  }
});

function preview(
  svg: string,
  linkedTaskIds?: ReadonlySet<string>,
  overrides?: Partial<ComponentProps<typeof DiagramPreview>>,
) {
  const callback = vi.fn();
  return (
    <DiagramPreview
      svg={svg}
      projectLinkedTaskIds={linkedTaskIds}
      tasks={[]}
      dependencies={[]}
      dividers={[]}
      verticalSeparators={[]}
      source=""
      zoom={1}
      selectedTaskId="build"
      onZoomChange={callback}
      onTaskSelect={callback}
      onNoteSelect={callback}
      onBackgroundSelect={callback}
      onTaskMove={callback}
      onTaskReorder={callback}
      onDividerReorder={callback}
      onVerticalSeparatorMove={callback}
      onVerticalSeparatorSelect={callback}
      onDividerSelect={callback}
      onTaskResize={callback}
      onDependencyCreate={callback}
      onDependencySelect={callback}
      onDependencyDelete={callback}
      onInteractionMessage={callback}
      resourceFilter=""
      renderStatus="idle"
      onRenderRetry={callback}
      parseDurationMs={0}
      openDocumentCount={1}
      openSourceBytes={0}
      resourceOverAllocations={[]}
      resourceCapacities={{}}
      onOpenResourceWorkload={callback}
      onDateHighlightRequest={callback}
      onLegendEditRequest={callback}
      onChangeBaseline={callback}
      onClearBaseline={callback}
      {...overrides}
    />
  );
}

it("sanitizes SVG at the final preview boundary and preserves task interaction metadata", () => {
  const view = render(
    preview(`<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">
    <script>alert(2)</script><foreignObject><div>Unsafe</div></foreignObject>
    <g data-task-id="build" role="button" tabindex="0" aria-label="Select Build"><text class="label">Safe &amp; sound</text></g>
  </svg>`),
  );
  const svg = view.container.querySelector(".diagram-svg-host svg");
  expect(svg).not.toBeNull();
  expect(svg?.querySelector("script, foreignObject")).toBeNull();
  expect(svg?.hasAttribute("onload")).toBe(false);
  expect(svg?.querySelector('[data-task-id="build"]')?.getAttribute("data-selected")).toBe("true");
  expect(svg?.querySelector('[data-task-id="build"]')?.getAttribute("role")).toBe("button");
  expect(svg?.querySelector('[data-task-id="build"]')?.getAttribute("tabindex")).toBe("0");
  expect(svg?.querySelector("text")?.textContent).toBe("Safe & sound");
});

it("installs sanitized fragments through StrictMode replay without losing SVG namespaces or retaining unsafe links", () => {
  const view = render(
    <StrictMode>
      {preview(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><a href="javascript:alert(1)"><text>Link</text></a></svg>',
      )}
    </StrictMode>,
  );
  const svg = view.container.querySelector(".diagram-svg-host svg");
  expect(svg?.namespaceURI).toBe("http://www.w3.org/2000/svg");
  expect(svg?.getAttribute("viewBox")).toBe("0 0 120 80");
  expect(svg?.querySelector("a")?.hasAttribute("href")).toBe(false);
  expect(svg?.querySelector("text")?.textContent).toBe("Link");
});

it("only parses timeline visibility while the baseline comparison report is available", () => {
  const parser = vi.spyOn(DOMParser.prototype, "parseFromString");
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg"><text data-timeline-date="2026-10-12">Timeline marker</text></svg>';
  const timelineParses = () =>
    parser.mock.calls.filter(([input, type]) => type === "image/svg+xml" && String(input).includes("Timeline marker"));
  try {
    const view = render(preview(svg));
    expect(timelineParses()).toHaveLength(0);
    view.rerender(preview(svg, undefined, { baselineSource: "@startgantt\n@endgantt" }));
    expect(timelineParses()).toHaveLength(1);
    view.rerender(preview(svg, undefined, { baselineSource: "@startgantt\n@endgantt" }));
    expect(timelineParses()).toHaveLength(1);
    view.rerender(preview(svg));
    expect(timelineParses()).toHaveLength(1);
    view.rerender(preview(svg, undefined, { baselineSource: "@startgantt\n@endgantt" }));
    expect(timelineParses()).toHaveLength(2);
  } finally {
    parser.mockRestore();
  }
});

it("moves selection markers on the installed SVG without re-sanitizing or reinstalling it", () => {
  const sanitize = vi.spyOn(sanitizeSvg, "sanitizeSvgFragment");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg">
    <g data-task-id="build"><text class="label">Build</text></g>
    <g data-task-id="test"><text class="label">Test</text></g>
    <g data-dependency-index="0"><path d="M0 0" /></g>
  </svg>`;
  try {
    const view = render(preview(svg, new Set(), { selectedTaskId: "build" }));
    const installed = view.container.querySelector(".diagram-svg-host svg");
    const sanitizeCalls = sanitize.mock.calls.length;
    expect(installed?.querySelector('[data-task-id="build"]')?.getAttribute("data-selected")).toBe("true");
    expect(installed?.querySelector('[data-task-id="test"]')?.hasAttribute("data-selected")).toBe(false);

    view.rerender(preview(svg, new Set(), { selectedTaskId: "test", selectedDependencyIndex: 0 }));
    expect(view.container.querySelector(".diagram-svg-host svg")).toBe(installed);
    expect(sanitize.mock.calls.length).toBe(sanitizeCalls);
    expect(installed?.querySelector('[data-task-id="build"]')?.hasAttribute("data-selected")).toBe(false);
    expect(installed?.querySelector('[data-task-id="test"]')?.getAttribute("data-selected")).toBe("true");
    expect(installed?.querySelector('[data-dependency-index="0"]')?.getAttribute("data-selected")).toBe("true");

    view.rerender(
      preview(svg, new Set(), {
        selectedTaskId: "build",
        selectedTaskIds: ["build", "test"],
        highlightedTaskId: "test",
      }),
    );
    expect(view.container.querySelector(".diagram-svg-host svg")).toBe(installed);
    expect(sanitize.mock.calls.length).toBe(sanitizeCalls);
    expect(installed?.querySelectorAll('[data-task-id][data-selected="true"]')).toHaveLength(2);
    expect(installed?.querySelector('[data-dependency-index="0"]')?.hasAttribute("data-selected")).toBe(false);
  } finally {
    sanitize.mockRestore();
  }
});

it("retains unchanged SVG nodes when link metadata rerenders and updates changed SVG safely", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>Original</text></svg>';
  const view = render(preview(svg, new Set()));
  const original = view.container.querySelector(".diagram-svg-host svg");
  expect(original).not.toBeNull();
  view.rerender(preview(svg, new Set()));
  expect(view.container.querySelector(".diagram-svg-host svg")).toBe(original);
  view.rerender(
    preview(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><text>Changed</text></svg>',
      new Set(),
    ),
  );
  const changed = view.container.querySelector(".diagram-svg-host svg");
  expect(changed).not.toBe(original);
  expect(changed?.textContent).toBe("Changed");
  expect(changed?.querySelector("script")).toBeNull();
  expect(changed?.hasAttribute("onload")).toBe(false);
});
