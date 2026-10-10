// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PresentationDialog } from "./PresentationDialog";
import { loadPresentationReview, type PresentationDocument } from "./presentation-review";
vi.mock("./render/use-renderer", () => ({
  rendererLayoutEngineForDiagramKind: () => "native",
  useRenderer: (source: string) => ({
    status: "idle",
    result: { source, svg: '<svg xmlns="http://www.w3.org/2000/svg"><text x="10" y="20">Build</text></svg>' },
  }),
}));
const doc: PresentationDocument = {
  id: "one",
  name: "Plan",
  kind: "gantt",
  source: "@startgantt\nProject starts 2026-10-02\n[Build] as [b] lasts 2 days\n@endgantt",
};
beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(SVGElement.prototype, "getBBox", {
    configurable: true,
    value: () => ({ x: 0, y: 0, width: 50, height: 20 }),
  });
});
afterEach(cleanup);
it("saves personal anchored notes and views and navigates only connected diagrams", async () => {
  const user = userEvent.setup();
  render(
    <PresentationDialog
      documents={[doc, { ...doc, id: "two", name: "Connected plan" }, { ...doc, id: "unrelated", name: "Unrelated" }]}
      connections={[{ from: "one", to: "two" }]}
      initialId="one"
      onClose={vi.fn()}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Views & local review" }));
  expect(screen.getByText(/Only you in this browser/)).toBeTruthy();
  await user.selectOptions(screen.getByLabelText("Diagram object"), "task:b");
  await user.click(screen.getByRole("button", { name: "Add highlight step" }));
  expect(document.querySelector(".presentation-highlight")).toBeTruthy();
  await user.type(screen.getByLabelText("View name"), "Build review");
  await user.click(screen.getByRole("button", { name: "Save named view" }));
  await user.type(screen.getByLabelText("Review note"), "Confirm estimate");
  await user.click(screen.getByRole("button", { name: "Add anchored note" }));
  expect(loadPresentationReview("one").notes[0]?.text).toBe("Confirm estimate");
  expect(loadPresentationReview("one").views[0]?.steps[0]?.stableAlias).toBe("b");
  await user.click(screen.getByRole("button", { name: "Resolve note" }));
  expect(loadPresentationReview("one").notes[0]?.resolved).toBe(true);
  expect(screen.queryByRole("option", { name: "Unrelated" })).toBeNull();
  await user.selectOptions(screen.getByLabelText("Connected diagrams"), "two");
  expect(screen.getByText("Connected plan", { selector: "strong" })).toBeTruthy();
  expect(screen.queryByText("Confirm estimate")).toBeNull();
});
it("preserves unreadable storage and blocks writes", async () => {
  localStorage.setItem("plantuml-presentation-review-v1:one", "invalid");
  const user = userEvent.setup();
  render(<PresentationDialog documents={[doc]} connections={[]} initialId="one" onClose={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Views & local review" }));
  expect(screen.getByRole("alert").textContent).toContain("will not be overwritten");
  expect((screen.getByRole("button", { name: "Save named view" }) as HTMLButtonElement).disabled).toBe(true);
  expect(localStorage.getItem("plantuml-presentation-review-v1:one")).toBe("invalid");
});
it("closes review first and exits on the next Escape while isolating workspace shortcuts", async () => {
  const user = userEvent.setup(),
    onClose = vi.fn(),
    shortcut = vi.fn();
  render(<PresentationDialog documents={[doc]} connections={[]} initialId="one" onClose={onClose} />);
  window.addEventListener("keydown", shortcut);
  await user.click(screen.getByRole("button", { name: "Views & local review" }));
  await user.keyboard("{Escape}");
  expect(onClose).not.toHaveBeenCalled();
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(shortcut).not.toHaveBeenCalled();
  window.removeEventListener("keydown", shortcut);
});
it("retains a draft note when browser storage is full", async () => {
  const user = userEvent.setup();
  render(<PresentationDialog documents={[doc]} connections={[]} initialId="one" onClose={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Views & local review" }));
  await user.selectOptions(screen.getByLabelText("Diagram object"), "task:b");
  await user.type(screen.getByLabelText("Review note"), "Keep my draft");
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("QuotaExceededError");
  });
  await user.click(screen.getByRole("button", { name: "Add anchored note" }));
  expect(screen.getByRole("alert").textContent).toContain("could not save");
  expect((screen.getByLabelText("Review note") as HTMLTextAreaElement).value).toBe("Keep my draft");
  expect(loadPresentationReview("one").notes).toEqual([]);
  write.mockRestore();
});
