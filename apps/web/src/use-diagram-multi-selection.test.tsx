// @vitest-environment jsdom
import { useRef, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useDiagramMultiSelection } from "./use-diagram-multi-selection";
const original = "@startuml\nclass One\nclass Two\n@enduml";
beforeEach(() => {
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  vi.stubGlobal("PointerEvent", MouseEvent);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function Harness({
  readOnly = false,
  kind = "class",
  onPreviewPointerDown,
}: {
  readOnly?: boolean;
  kind?: "class" | "wbs";
  onPreviewPointerDown?(): void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState(kind === "wbs" ? "@startwbs\n* Root\n** One\n** Two\n@endwbs" : original);
  const [documentId, setDocumentId] = useState("first");
  const [count, setCount] = useState(0);
  const multi = useDiagramMultiSelection({
    kind,
    source,
    documentId,
    root,
    readOnly,
    report: () => {},
    commit: (next) => {
      setCount((count) => count + 1);
      setSource(next);
      return true;
    },
  });
  return (
    <>
      <div
        ref={root}
        onClickCapture={multi.onClickCapture}
        onPointerDownCapture={multi.onPointerDownCapture}
        onKeyDownCapture={multi.onKeyDownCapture}
      >
        <div className="diagram" onPointerDown={onPreviewPointerDown}>
          <svg>
            <rect data-class-object-id="one" data-wbs-node-id="wbs-1" role="button" tabIndex={0} aria-label="One" />
            <rect data-class-object-id="two" data-wbs-node-id="wbs-2" role="button" tabIndex={0} aria-label="Two" />
            <rect data-testid="background" />
          </svg>
        </div>
      </div>
      <output data-testid="selected">{multi.selected.length}</output>
      <output data-testid="commits">{count}</output>
      <output data-testid="source">{source}</output>
      <button onClick={() => multi.change("color", "Red")}>Bulk color</button>
      <button onClick={multi.copy}>Copy selection</button>
      <button onClick={multi.paste}>Paste selection</button>
      <button onClick={() => multi.duplicateAt({ from: source.indexOf("One"), to: source.indexOf("One") + 3 })}>
        Duplicate One
      </button>
      <button onClick={() => setSource("@startuml\nclass Other\nclass One\nclass Two\n@enduml")}>External edit</button>
      <button onClick={() => setDocumentId("second")}>Switch tab</button>
      <input aria-label="Text field" />
    </>
  );
}
it("toggles selection, highlights targets, clears on background and commits a bulk edit once", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "One" }));
  fireEvent.click(screen.getByRole("button", { name: "Two" }), { shiftKey: true });
  expect(screen.getByTestId("selected")).toHaveTextContent("2");
  expect(screen.getByRole("button", { name: "One" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Bulk color" }));
  expect(screen.getByTestId("commits")).toHaveTextContent("1");
  expect(screen.getByTestId("selected")).toHaveTextContent("2");
  fireEvent.click(screen.getByRole("button", { name: "Two" }), { ctrlKey: true });
  expect(screen.getByTestId("selected")).toHaveTextContent("1");
  fireEvent.click(screen.getByTestId("background"));
  expect(screen.getByTestId("selected")).toHaveTextContent("0");
});
it("preserves WBS Shift-drag while Shift-click toggles selection", () => {
  const onPreviewPointerDown = vi.fn();
  render(<Harness kind="wbs" onPreviewPointerDown={onPreviewPointerDown} />);
  fireEvent.click(screen.getByRole("button", { name: "One" }));
  const two = screen.getByRole("button", { name: "Two" });
  fireEvent.pointerDown(two, { button: 0, shiftKey: true, clientX: 10, clientY: 10 });
  expect(onPreviewPointerDown).toHaveBeenCalledOnce();
  fireEvent.pointerUp(two, { button: 0, shiftKey: true, clientX: 10, clientY: 10 });
  fireEvent.click(two, { shiftKey: true, clientX: 10, clientY: 10 });
  expect(screen.getByTestId("selected")).toHaveTextContent("2");
  fireEvent.pointerDown(two, { button: 0, shiftKey: true, clientX: 10, clientY: 10 });
  fireEvent.pointerUp(two, { button: 0, shiftKey: true, clientX: 30, clientY: 10 });
  fireEvent.click(two, { shiftKey: true, clientX: 30, clientY: 10 });
  expect(screen.getByTestId("selected")).toHaveTextContent("2");
});
it("clears stale selection when source or active document changes", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "One" }));
  fireEvent.click(screen.getByRole("button", { name: "Two" }), { shiftKey: true });
  fireEvent.click(screen.getByRole("button", { name: "External edit" }));
  expect(screen.getByTestId("selected")).toHaveTextContent("0");
  fireEvent.click(screen.getByRole("button", { name: "One" }));
  fireEvent.click(screen.getByRole("button", { name: "Switch tab" }));
  expect(screen.getByTestId("selected")).toHaveTextContent("0");
});
it("lets viewers select and copy but never commits paste or a bulk change", () => {
  render(<Harness readOnly />);
  fireEvent.click(screen.getByRole("button", { name: "One" }));
  fireEvent.keyDown(screen.getByRole("button", { name: "Two" }), { key: "Enter", shiftKey: true });
  fireEvent.click(screen.getByRole("button", { name: "Bulk color" }));
  fireEvent.click(screen.getByRole("button", { name: "Copy selection" }));
  fireEvent.click(screen.getByRole("button", { name: "Paste selection" }));
  fireEvent.click(screen.getByRole("button", { name: "Duplicate One" }));
  fireEvent.keyDown(window, { key: "d", ctrlKey: true });
  expect(screen.getByTestId("selected")).toHaveTextContent("2");
  expect(screen.getByTestId("commits")).toHaveTextContent("0");
});
it("duplicates the whole selection when the context target is selected", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "One" }));
  fireEvent.click(screen.getByRole("button", { name: "Two" }), { shiftKey: true });
  fireEvent.click(screen.getByRole("button", { name: "Duplicate One" }));
  expect(screen.getByTestId("source")).toHaveTextContent("One_copy");
  expect(screen.getByTestId("source")).toHaveTextContent("Two_copy");
  expect(screen.getByTestId("commits")).toHaveTextContent("1");
});
it("duplicates only an unselected context target", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Two" }));
  fireEvent.click(screen.getByRole("button", { name: "Duplicate One" }));
  expect(screen.getByTestId("source")).toHaveTextContent("One_copy");
  expect(screen.getByTestId("source")).not.toHaveTextContent("Two_copy");
  expect(screen.getByTestId("commits")).toHaveTextContent("1");
});
it("does not hijack select-all, copy or paste in text fields", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "One" }));
  fireEvent.click(screen.getByRole("button", { name: "Copy selection" }));
  for (const key of ["a", "c", "v", "d"])
    expect(fireEvent.keyDown(screen.getByLabelText("Text field"), { key, ctrlKey: true })).toBe(true);
  expect(screen.getByTestId("commits")).toHaveTextContent("0");
});
