import { requestSidePanelChange } from "./side-panel-events";
// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { InspectorPanel } from "./InspectorPanel";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("does not restore the old opener when switching to different properties", async () => {
  const opener = document.createElement("button");
  document.body.append(opener);
  opener.focus();
  try {
    const view = render(
      <InspectorPanel key="task" className="task-inspector" aria-label="Task">
        <button>Task action</button>
      </InspectorPanel>,
    );
    screen.getByRole("button", { name: "Task action" }).focus();
    const focus = vi.spyOn(opener, "focus");
    view.rerender(
      <InspectorPanel key="wbs" className="task-inspector" aria-label="WBS">
        <button>WBS action</button>
      </InspectorPanel>,
    );
    await Promise.resolve();
    expect(focus).not.toHaveBeenCalled();
  } finally {
    opener.remove();
  }
});

it("protects staged settings that use an Apply button without a form", async () => {
  const onClose = vi.fn();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(
    <InspectorPanel className="task-inspector" aria-label="Settings">
      <header>
        <button aria-label="Close settings" onClick={onClose}>
          Close
        </button>
      </header>
      <label>
        Title
        <input defaultValue="Original" />
      </label>
      <button>Apply</button>
    </InspectorPanel>,
  );
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox", { name: "Title" }), " draft");
  await user.click(screen.getByRole("button", { name: "Close settings" }));
  expect(confirm).toHaveBeenCalledOnce();
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Original draft");
  await user.click(screen.getByRole("button", { name: "Apply" }));
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await user.click(screen.getByRole("button", { name: "Close settings" }));
  expect(confirm).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalledOnce();
});

it("does not treat immediately applied capacity controls as a rename form draft", async () => {
  const onClose = vi.fn();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(
    <InspectorPanel className="task-inspector" aria-label="Resources">
      <header>
        <button aria-label="Close resources" onClick={onClose}>
          Close
        </button>
      </header>
      <label>
        Capacity
        <input type="number" min={1} step={5} defaultValue={100} />
      </label>
      <form>
        <label>
          Rename
          <input defaultValue="Alice" />
        </label>
        <button type="submit">Save</button>
      </form>
    </InspectorPanel>,
  );
  const user = userEvent.setup();
  await user.clear(screen.getByRole("spinbutton", { name: "Capacity" }));
  await user.type(screen.getByRole("spinbutton", { name: "Capacity" }), "50");
  await user.click(screen.getByRole("button", { name: "Close resources" }));
  expect(confirm).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledOnce();
});

it("guards Escape from outside the panel and restores focus after accepted dismissal", async () => {
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const opener = document.createElement("button");
  opener.textContent = "Open properties";
  document.body.append(opener);
  opener.focus();
  const onClose = vi.fn();
  const view = render(
    <InspectorPanel closeOnOutsideEscape className="task-inspector" aria-label="Draft panel">
      <header>
        <button aria-label="Close draft" onClick={onClose}>
          Close
        </button>
      </header>
      <label>
        Title
        <input defaultValue="Original" />
      </label>
      <button>Apply</button>
    </InspectorPanel>,
  );
  try {
    await user.type(screen.getByRole("textbox", { name: "Title" }), " draft");
    expect(requestSidePanelChange()).toBe(false);
    opener.focus();
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue("Original draft");
    confirm.mockReturnValue(true);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
    view.unmount();
    await Promise.resolve();
    expect(opener).toHaveFocus();
  } finally {
    opener.remove();
  }
});

it("leaves Escape to a nested modal while a panel has a draft", async () => {
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const onClose = vi.fn();
  render(
    <>
      <InspectorPanel className="task-inspector">
        <header>
          <button aria-label="Close properties" onClick={onClose}>
            Close
          </button>
        </header>
        <label>
          Title
          <input defaultValue="Original" />
        </label>
        <button>Apply</button>
      </InspectorPanel>
      <div role="dialog" aria-modal="true">
        <button>Modal action</button>
      </div>
    </>,
  );
  await user.type(screen.getByRole("textbox"), " draft");
  screen.getByRole("button", { name: "Modal action" }).focus();
  await user.keyboard("{Escape}");
  expect(confirm).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});

it("returns focus to the workspace when the original diagram opener no longer exists", async () => {
  const opener = document.createElement("button");
  document.body.append(opener);
  opener.focus();
  const view = render(
    <div className="app">
      <main className="workspace" tabIndex={-1} />
      <InspectorPanel className="task-inspector">
        <button>Property action</button>
      </InspectorPanel>
    </div>,
  );
  screen.getByRole("button", { name: "Property action" }).focus();
  opener.remove();
  view.rerender(
    <div className="app">
      <main className="workspace" tabIndex={-1} />
    </div>,
  );
  await Promise.resolve();
  expect(screen.getByRole("main")).toHaveFocus();
});

it("closes with one Escape before a focused editor can consume it", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  const editorEscape = vi.fn((event: KeyboardEvent) => event.preventDefault());
  render(
    <>
      <textarea aria-label="Source" />
      <InspectorPanel className="task-inspector">
        <header>
          <button aria-label="Close properties" onClick={onClose}>
            Close
          </button>
        </header>
      </InspectorPanel>
    </>,
  );
  const source = screen.getByRole("textbox", { name: "Source" });
  source.addEventListener("keydown", editorEscape);
  source.focus();
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledOnce();
  expect(editorEscape).not.toHaveBeenCalled();
});

it("closes bulk properties through their footer action with one Escape", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(
    <InspectorPanel className="task-inspector">
      <header>
        <strong>Selected tasks</strong>
      </header>
      <div className="inspector-actions">
        <button onClick={onClose}>Close</button>
      </div>
    </InspectorPanel>,
  );
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledOnce();
});

it("shows staged changes and invalid fields without changing commit rules", async () => {
  const user = userEvent.setup();
  render(
    <InspectorPanel>
      <header>Properties</header>
      <form>
        <input aria-label="Name" required defaultValue="Original" />
        <button type="button">Apply</button>
      </form>
    </InspectorPanel>,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Applied");
  await user.type(screen.getByRole("textbox"), " draft");
  expect(screen.getByRole("status")).toHaveTextContent("Unapplied changes");
  await user.clear(screen.getByRole("textbox"));
  expect(screen.getByRole("status")).toHaveTextContent("Invalid changes");
  await user.type(screen.getByRole("textbox"), "Valid");
  await user.click(screen.getByRole("button", { name: "Apply" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/^Applied/));
});
