// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { ReviewPanel } from "./ReviewPanel";
import { buildReviewGroups } from "./semantic-review";

afterEach(cleanup);
const left = "@startuml\nA -> B : one\n@enduml";
const right = "@startuml\nA -> B : one\nB --> A : two\n@enduml";

it("lists groups, reports selection changes, labels outside groups and renders its children", async () => {
  const groups = buildReviewGroups(left, right, "sequence");
  expect(groups.length).toBeGreaterThan(0);
  const change = vi.fn();
  const show = vi.fn();
  render(
    <ReviewPanel
      groups={groups}
      diagramKind="sequence"
      before={left}
      selectedGroups={new Set()}
      onSelectedGroupsChange={change}
      activeGroupId={undefined}
      visibleGroupIds={new Set()}
      onShowInDiagram={show}
      onShowInSource={show}
      outsideGroupIds={new Set([groups[0]!.id])}
    >
      <button type="button">Apply here</button>
    </ReviewPanel>,
  );
  const user = userEvent.setup();
  expect(screen.getByText("Outside your selection")).toBeInTheDocument();
  await user.click(screen.getByRole("checkbox", { name: `Select ${groups[0]!.title}` }));
  expect(change).toHaveBeenCalledWith(new Set([groups[0]!.id]));
  await user.click(screen.getByRole("button", { name: `Show ${groups[0]!.title} in source` }));
  expect(show).toHaveBeenCalledWith(groups[0]!.id);
  expect(screen.getByRole("button", { name: "Apply here" })).toBeInTheDocument();
});

it("shows the empty text when there are no groups", () => {
  render(
    <ReviewPanel
      groups={[]}
      diagramKind="sequence"
      before={left}
      selectedGroups={new Set()}
      onSelectedGroupsChange={() => undefined}
      activeGroupId={undefined}
      visibleGroupIds={new Set()}
      onShowInDiagram={() => undefined}
      onShowInSource={() => undefined}
    />,
  );
  expect(screen.getByText("No changes between these versions.")).toBeInTheDocument();
});
