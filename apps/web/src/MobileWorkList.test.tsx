// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MobileWorkList } from "./MobileWorkList";
import { editTaskRow, type TaskRowDraft } from "./gantt-task-table";
const source =
  "@startgantt\n' Keep source context\nProject starts 2026-10-02\n[Build] as [b] on {Morgan:50%} lasts 2 days\n[Build] is 20% completed\n[Test] lasts 1 day\n[Test] starts at [b]'s end\n@endgantt";
const props = () => ({
  kind: "gantt" as const,
  source,
  readOnly: false,
  onApply: vi.fn<(draft: TaskRowDraft) => string | undefined>(() => undefined),
  onDiagram: vi.fn(),
  onSheetChange: vi.fn(),
});
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);
it("stages progress/resources together and preserves source context with one apply", async () => {
  const p = props(),
    user = userEvent.setup();
  render(<MobileWorkList {...p} />);
  await user.click(screen.getByRole("button", { name: "Open task Build" }));
  await user.clear(screen.getByLabelText("Progress (%)"));
  await user.type(screen.getByLabelText("Progress (%)"), "60");
  await user.clear(screen.getByLabelText("Name"));
  await user.type(screen.getByLabelText("Name"), "Sam");
  expect(p.onApply).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Apply check-in" }));
  expect(p.onApply).toHaveBeenCalledTimes(1);
  const edited = editTaskRow(source, p.onApply.mock.calls[0]![0]);
  expect("error" in edited).toBe(false);
  if (!("error" in edited)) {
    expect(edited.source).toContain("[Build] as [b] on {Sam:50%} lasts 2 days");
    expect(edited.source).toContain("60% completed");
    expect(edited.source).toContain("' Keep source context");
    expect(edited.source).toContain("[Test] starts at [b]'s end");
  }
});
it("rejects invalid input and cancellation restores focus without applying", async () => {
  const p = props(),
    user = userEvent.setup();
  render(<MobileWorkList {...p} />);
  const opener = screen.getByRole("button", { name: "Open task Build" });
  await user.click(opener);
  await user.clear(screen.getByLabelText("Progress (%)"));
  await user.type(screen.getByLabelText("Progress (%)"), "150");
  expect((screen.getByRole("button", { name: "Apply check-in" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("alert").textContent).toContain("0 to 100");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(p.onApply).not.toHaveBeenCalled();
});
it("blocks stale and viewer drafts while keeping cancellation available", async () => {
  const p = props(),
    user = userEvent.setup(),
    ui = render(<MobileWorkList {...p} />);
  await user.click(screen.getByRole("button", { name: "Open task Build" }));
  await user.clear(screen.getByLabelText("Progress (%)"));
  await user.type(screen.getByLabelText("Progress (%)"), "70");
  ui.rerender(<MobileWorkList {...p} source={source + "\n' remote edit"} />);
  expect(screen.getByRole("alert").textContent).toContain("source changed");
  expect((screen.getByRole("button", { name: "Apply check-in" }) as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  ui.rerender(<MobileWorkList {...p} readOnly />);
  await user.click(screen.getByRole("button", { name: "Open task Build" }));
  expect((screen.getByLabelText("Progress (%)") as HTMLInputElement).disabled).toBe(true);
  expect(p.onApply).not.toHaveBeenCalled();
});
it("browses WBS parent/child packages and reveals the selected node", async () => {
  const p = props(),
    user = userEvent.setup();
  render(
    <MobileWorkList
      {...p}
      kind="wbs"
      source={"@startwbs\n*(root) Project\n**(build) Build\n***(test) Test\n@endwbs"}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Open work package Build" }));
  await user.click(screen.getByRole("button", { name: "Test" }));
  expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe("Work package: Test");
  await user.click(screen.getByRole("button", { name: "Parent: Build" }));
  await user.click(screen.getByRole("button", { name: "View on diagram" }));
  expect(p.onDiagram).toHaveBeenCalledTimes(1);
  expect(p.onApply).not.toHaveBeenCalled();
});
it("keeps a failed apply draft and follows visual viewport resize events", async () => {
  const viewport = Object.assign(new EventTarget(), { height: 400, offsetTop: 20 });
  vi.stubGlobal("visualViewport", viewport);
  const p = props(),
    user = userEvent.setup();
  p.onApply.mockReturnValue("Source changed before apply");
  render(<MobileWorkList {...p} />);
  await user.click(screen.getByRole("button", { name: "Open task Build" }));
  await user.clear(screen.getByLabelText("Progress (%)"));
  await user.type(screen.getByLabelText("Progress (%)"), "40");
  await user.click(screen.getByRole("button", { name: "Apply check-in" }));
  expect(screen.getByRole("alert").textContent).toContain("Source changed before apply");
  expect((screen.getByLabelText("Progress (%)") as HTMLInputElement).value).toBe("40");
  viewport.height = 300;
  viewport.dispatchEvent(new Event("resize"));
  expect((screen.getByRole("dialog") as HTMLElement).style.getPropertyValue("--sheet-height")).toBe("300px");
  vi.unstubAllGlobals();
});
