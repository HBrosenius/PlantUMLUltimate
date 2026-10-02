// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { DiagramPreview } from "./DiagramPreview";

it("sanitizes SVG at the final preview boundary and preserves task interaction metadata", () => {
  const callback = vi.fn();
  const markup = renderToStaticMarkup(
    <DiagramPreview
      svg={`<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">
        <script>alert(2)</script><foreignObject><div>Unsafe</div></foreignObject>
        <g data-task-id="build" role="button" tabindex="0" aria-label="Select Build"><text class="label">Safe &amp; sound</text></g>
      </svg>`}
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
    />,
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
