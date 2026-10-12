// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { DiagramPreview } from "./DiagramPreview";

afterEach(cleanup);

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
  const markup = renderToStaticMarkup(
    preview(`<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">
    <script>alert(2)</script><foreignObject><div>Unsafe</div></foreignObject>
    <g data-task-id="build" role="button" tabindex="0" aria-label="Select Build"><text class="label">Safe &amp; sound</text></g>
  </svg>`),
  );
  const document = new DOMParser().parseFromString(markup, "text/html");
  const svg = document.querySelector(".diagram-svg-host svg");
  expect(svg).not.toBeNull();
  expect(svg?.querySelector("script, foreignObject")).toBeNull();
  expect(svg?.hasAttribute("onload")).toBe(false);
  expect(svg?.querySelector('[data-task-id="build"]')?.getAttribute("data-selected")).toBe("true");
  expect(svg?.querySelector('[data-task-id="build"]')?.getAttribute("role")).toBe("button");
  expect(svg?.querySelector('[data-task-id="build"]')?.getAttribute("tabindex")).toBe("0");
  expect(svg?.querySelector("text")?.textContent).toBe("Safe & sound");
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
